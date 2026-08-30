import { teamSchemas, type Member, type Team } from "../../shared/teams"
import type { ProviderAvailability } from "../../shared/providers"
import type { Observability } from "../observability/observability"
import type { AppDatabase } from "../persistence/database"

type ProviderDirectory = {
  list(): Promise<ProviderAvailability[]>
}

type TeamsDependencies = {
  database: AppDatabase
  observability: Observability
  providers: ProviderDirectory
}

export function createTeams({ database, observability, providers }: TeamsDependencies) {
  return {
    async create(rawInput: unknown) {
      const input = teamSchemas.createInput.assert(rawInput)
      const availableProviders = await providers.list()
      const selectedProvider = availableProviders.find((provider) => provider.provider === input.defaultProvider)

      if (selectedProvider?.status !== "available") {
        throw new Error(`Provider ${input.defaultProvider} is not available`)
      }

      const createdAt = new Date().toISOString()
      const team: Team = {
        id: crypto.randomUUID(),
        name: input.name,
        objective: input.objective,
        defaultProvider: input.defaultProvider,
        createdAt,
        leader: {
          id: crypto.randomUUID(),
          name: input.leader.name,
          role: "leader",
          provider: input.defaultProvider,
          function: input.leader.function,
          createdAt,
        },
        members: [],
      }

      return observability.span({
        name: "teams.create",
        context: { teamId: team.id, botId: team.leader.id, provider: team.defaultProvider },
      }, () => database.teams.create(team))
    },
    async createMember(rawInput: unknown) {
      const input = teamSchemas.createMemberInput.assert(rawInput)
      const team = database.teams.get(input.teamId)

      if (!team) {
        throw new Error("Team not found")
      }

      const provider = input.provider ?? team.defaultProvider
      const availableProviders = await providers.list()
      const selectedProvider = availableProviders.find((entry) => entry.provider === provider)

      if (selectedProvider?.status !== "available") {
        throw new Error(`Provider ${provider} is not available`)
      }

      const member: Member = {
        id: crypto.randomUUID(),
        teamId: team.id,
        name: input.name,
        role: "member",
        provider,
        function: input.function,
        createdAt: new Date().toISOString(),
      }

      return observability.span({
        name: "teams.membercreate",
        context: { teamId: team.id, botId: member.id, provider },
      }, () => database.teams.createMember(member))
    },
    list() {
      return teamSchemas.teamList.assert(database.teams.list())
    },
    get(rawInput: unknown) {
      const input = teamSchemas.idInput.assert(rawInput)
      const team = database.teams.get(input.id)

      return team ? teamSchemas.team.assert(team) : undefined
    },
  }
}
