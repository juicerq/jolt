import { mkdir, rm } from "node:fs/promises"
import { join } from "node:path"
import { botSchemas, type Bot, type CreateBotInput, type StoredBot } from "../../shared/bots"
import type { ProviderAvailability } from "../../shared/providers"
import type { Observability } from "../observability/observability"
import type { AppDatabase } from "../persistence/database"
import { assertAccessibleWorkingDirectory } from "../projects/working-directory"

type BotsDependencies = {
  database: AppDatabase
  observability: Observability
  privateBotsDirectory: string
  providers: { list(): Promise<ProviderAvailability[]> }
  conversations: { close(botId: string): Promise<void> }
}

export function createBots({ database, observability, privateBotsDirectory, providers, conversations }: BotsDependencies) {
  async function privateDirectory(botId: string) {
    const path = join(privateBotsDirectory, botId)
    await mkdir(path, { recursive: true })

    return path
  }

  function projectWorkingDirectory(projectId: string | null) {
    if (!projectId) {
      return undefined
    }

    const project = database.projects.get(projectId)

    if (!project) {
      throw new Error("Project not found")
    }

    return project.defaultWorkingDirectory
  }

  function workspaceFor(input: CreateBotInput): Pick<StoredBot, "leaderBotId" | "projectId" | "workingDirectoryOverride"> {
    if ("leaderBotId" in input) {
      const leader = database.bots.get(input.leaderBotId)

      if (!leader) {
        throw new Error("Leader not found")
      }

      if (leader.leaderBotId) {
        throw new Error("A member cannot lead")
      }

      return { leaderBotId: leader.id, projectId: leader.projectId, workingDirectoryOverride: input.workingDirectoryOverride ?? leader.workingDirectoryOverride }
    }

    if (input.projectId) {
      projectWorkingDirectory(input.projectId)
    }

    return { leaderBotId: null, projectId: input.projectId ?? null, workingDirectoryOverride: input.workingDirectoryOverride ?? null }
  }

  function present(storedBot: StoredBot, workingAssigneeIds = database.tasks.workingAssigneeIds()): Bot {
    const effectiveWorkingDirectory = storedBot.workingDirectoryOverride
      ?? projectWorkingDirectory(storedBot.projectId)
      ?? join(privateBotsDirectory, storedBot.id)
    const closed = storedBot.temporary && !workingAssigneeIds.has(storedBot.id)

    return botSchemas.bot.assert({ ...storedBot, effectiveWorkingDirectory, closed })
  }

  async function store(storedBot: StoredBot) {
    await privateDirectory(storedBot.id)

    return observability.span(
      { name: "bots.create", context: { botId: storedBot.id, provider: storedBot.provider, ...(storedBot.projectId ? { projectId: storedBot.projectId } : {}), ...(storedBot.leaderBotId ? { leaderBotId: storedBot.leaderBotId } : {}) }, attributes: { state: storedBot.temporary ? "temporary" : "permanent" } },
      () => present(database.bots.create(storedBot)),
    )
  }

  return {
    async create(rawInput: unknown) {
      const input = botSchemas.createInput.assert(rawInput)
      const availableProviders = await providers.list()
      const selectedProvider = availableProviders.find((provider) => provider.provider === input.provider)

      if (selectedProvider?.status !== "available") {
        throw new Error(`Provider ${input.provider} is not available`)
      }

      const workspace = workspaceFor(input)

      if (input.workingDirectoryOverride) {
        await assertAccessibleWorkingDirectory(input.workingDirectoryOverride)
      }

      return store({
        id: crypto.randomUUID(),
        ...workspace,
        name: input.name,
        provider: input.provider,
        function: input.function,
        temporary: false,
        memoryEnabled: true,
        effort: "medium",
        model: null,
        createdAt: new Date().toISOString(),
      })
    },
    hire(leader: Pick<StoredBot, "id" | "projectId" | "provider" | "workingDirectoryOverride">, rawDetails: unknown) {
      const details = botSchemas.hireInput.assert(rawDetails)

      return store({
        id: crypto.randomUUID(),
        leaderBotId: leader.id,
        projectId: leader.projectId,
        name: details.name,
        provider: leader.provider,
        function: details.function,
        workingDirectoryOverride: leader.workingDirectoryOverride,
        temporary: !details.permanent,
        memoryEnabled: true,
        effort: "medium",
        model: null,
        createdAt: new Date().toISOString(),
      })
    },
    list() {
      const workingAssigneeIds = database.tasks.workingAssigneeIds()
      const listedBots = database.bots.list().map((storedBot) => present(storedBot, workingAssigneeIds))

      return botSchemas.botList.assert(listedBots)
    },
    get(rawInput: unknown) {
      const input = botSchemas.idInput.assert(rawInput)
      const storedBot = database.bots.get(input.id)

      return storedBot ? present(storedBot) : undefined
    },
    async update(rawInput: unknown) {
      const input = botSchemas.updateInput.assert(rawInput)
      const storedBot = database.bots.get(input.id)

      if (!storedBot) {
        throw new Error("Bot not found")
      }

      if (input.projectId) {
        projectWorkingDirectory(input.projectId)
      }

      if (input.workingDirectoryOverride) {
        await assertAccessibleWorkingDirectory(input.workingDirectoryOverride)
      }

      if (storedBot.leaderBotId) {
        const leader = database.bots.get(storedBot.leaderBotId)

        if (!leader || leader.projectId !== input.projectId) {
          throw new Error("A member must remain in the Leader Project")
        }
      }

      return observability.span(
        { name: "bots.update", context: { botId: storedBot.id, ...(input.projectId ? { projectId: input.projectId } : {}) } },
        () => {
          const updated = database.bots.update(storedBot.id, {
            name: input.name,
            function: input.function,
            projectId: input.projectId,
            workingDirectoryOverride: input.workingDirectoryOverride,
            memoryEnabled: input.memoryEnabled,
            effort: input.effort,
            model: input.model,
          })

          if (!updated) {
            throw new Error("Bot not found")
          }

          return present(updated)
        },
      )
    },
    async remove(rawInput: unknown) {
      const input = botSchemas.idInput.assert(rawInput)
      const storedBot = database.bots.get(input.id)

      if (!storedBot) {
        throw new Error("Bot not found")
      }

      const members = database.bots.list().filter((candidate) => candidate.leaderBotId === storedBot.id)
      const team = [storedBot, ...members]

      await observability.span(
        { name: "bots.remove", context: { botId: storedBot.id }, attributes: { count: team.length } },
        async () => {
          for (const bot of team) {
            await conversations.close(bot.id)
          }

          database.bots.remove(storedBot.id)
          await Promise.all(team.map((bot) => rm(join(privateBotsDirectory, bot.id), { recursive: true, force: true })))
        },
      )
    },
    async directory(rawInput: unknown) {
      const input = botSchemas.idInput.assert(rawInput)

      if (!database.bots.get(input.id)) {
        throw new Error("Bot not found")
      }

      return privateDirectory(input.id)
    },
    async resolveWorkingDirectory(rawInput: unknown) {
      const input = botSchemas.idInput.assert(rawInput)
      const storedBot = database.bots.get(input.id)

      if (!storedBot) {
        throw new Error("Bot not found")
      }

      await privateDirectory(storedBot.id)
      const effectiveWorkingDirectory = present(storedBot).effectiveWorkingDirectory
      await assertAccessibleWorkingDirectory(effectiveWorkingDirectory)

      return effectiveWorkingDirectory
    },
  }
}
