import { mkdir, rm } from "node:fs/promises"
import { join } from "node:path"
import { botSchemas, type Bot, type BotExecutionSettingInput, type CreateBotInput, type StoredBot } from "../../shared/bots"
import type { ProviderAvailability } from "../../shared/providers"
import type { Observability } from "../observability/observability"
import type { AppDatabase } from "../persistence/database"
import { assertAccessibleWorkingDirectory } from "../projects/working-directory"
import { parse } from "../../shared/parse"

type BotsDependencies = {
  database: AppDatabase
  observability: Observability
  privateBotsDirectory: string
  providers: { list(): Promise<ProviderAvailability[]> }
  conversations: { close(botId: string): Promise<void> }
}

function executionChange(input: BotExecutionSettingInput) {
  if (input.setting === "effort") {
    return { effort: input.value }
  }

  if (input.setting === "model") {
    return { model: input.value }
  }

  return { permissionMode: input.value }
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

  function colleagueIdsByBot(relations = database.colleagues.list()) {
    const grouped = new Map<string, string[]>()

    for (const relation of relations) {
      grouped.set(relation.botId, [...(grouped.get(relation.botId) ?? []), relation.colleagueBotId])
    }

    return grouped
  }

  function present(storedBot: StoredBot, workingAssigneeIds = database.tasks.workingAssigneeIds(), colleagueIds = colleagueIdsByBot(database.colleagues.listForBot(storedBot.id))): Bot {
    const effectiveWorkingDirectory = storedBot.workingDirectoryOverride
      ?? projectWorkingDirectory(storedBot.projectId)
      ?? join(privateBotsDirectory, storedBot.id)
    const closed = storedBot.temporary && !workingAssigneeIds.has(storedBot.id)

    return parse(botSchemas.bot, { ...storedBot, effectiveWorkingDirectory, closed, colleagueIds: colleagueIds.get(storedBot.id) ?? [] })
  }

  function list() {
    const workingAssigneeIds = database.tasks.workingAssigneeIds()
    const colleagueIds = colleagueIdsByBot()
    const listedBots = database.bots.list().map((storedBot) => present(storedBot, workingAssigneeIds, colleagueIds))

    return parse(botSchemas.botList, listedBots)
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
      const input = parse(botSchemas.createInput, rawInput)
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
        permissionMode: "ask",
        createdAt: new Date().toISOString(),
      })
    },
    hire(leader: Pick<StoredBot, "id" | "projectId" | "provider" | "workingDirectoryOverride">, rawDetails: unknown) {
      const details = parse(botSchemas.hireInput, rawDetails)

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
        permissionMode: "ask",
        createdAt: new Date().toISOString(),
      })
    },
    list,
    get(rawInput: unknown) {
      const input = parse(botSchemas.idInput, rawInput)
      const storedBot = database.bots.get(input.id)

      return storedBot ? present(storedBot) : undefined
    },
    colleagues(bot: Pick<Bot, "id">) {
      const colleagueIds = database.colleagues.listForBot(bot.id).map((relation) => relation.colleagueBotId)

      return list().filter((candidate) => colleagueIds.includes(candidate.id))
    },
    addColleague(botId: string, colleagueBotId: string) {
      const caller = database.bots.get(botId)
      const target = database.bots.get(colleagueBotId)

      if (!caller || !target) {
        throw new Error("Bot not found")
      }

      if (caller.temporary) {
        throw new Error(`${caller.name} is temporary and cannot have Colegas`)
      }

      if (target.id === caller.id) {
        throw new Error(`${caller.name} cannot be its own Colega`)
      }

      if (target.leaderBotId) {
        throw new Error(`${target.name} is a member of a team and cannot be a Colega`)
      }

      return observability.span(
        { name: "bots.colleagueadd", context: { botId: caller.id } },
        () => database.colleagues.set({ botId: caller.id, colleagueBotId: target.id }),
      )
    },
    removeColleague(rawInput: unknown) {
      const input = parse(botSchemas.colleagueInput, rawInput)
      const removed = observability.span({ name: "bots.colleagueremove", context: { botId: input.botId } }, () => database.colleagues.remove(input.botId, input.colleagueBotId))

      if (removed === 0) {
        throw new Error("Colega not found")
      }
    },
    async update(rawInput: unknown) {
      const input = parse(botSchemas.updateInput, rawInput)
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
            permissionMode: input.permissionMode,
          })

          if (!updated) {
            throw new Error("Bot not found")
          }

          return present(updated)
        },
      )
    },
    updateExecution(rawInput: unknown) {
      const input = parse(botSchemas.updateExecutionInput, rawInput)
      const updated = database.bots.updateExecution(input.id, executionChange(input))

      if (!updated) {
        throw new Error("Bot not found")
      }

      return present(updated)
    },
    async remove(rawInput: unknown) {
      const input = parse(botSchemas.idInput, rawInput)
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
      const input = parse(botSchemas.idInput, rawInput)

      if (!database.bots.get(input.id)) {
        throw new Error("Bot not found")
      }

      return privateDirectory(input.id)
    },
    async resolveWorkingDirectory(rawInput: unknown) {
      const input = parse(botSchemas.idInput, rawInput)
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
