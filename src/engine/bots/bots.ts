import { mkdir } from "node:fs/promises"
import { join } from "node:path"
import { botSchemas, type Bot, type CreateBotInput, type StoredBot } from "../../shared/bots"
import type { ProviderAvailability } from "../../shared/providers"
import type { Observability } from "../observability/observability"
import type { AppDatabase } from "../persistence/database"
import { assertAccessibleWorkingDirectory } from "../projects/working-directory"

type BotsDependencies = { database: AppDatabase; observability: Observability; privateBotsDirectory: string; providers: { list(): Promise<ProviderAvailability[]> } }

export function createBots({ database, observability, privateBotsDirectory, providers }: BotsDependencies) {
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

  function withEffectiveWorkingDirectory(storedBot: StoredBot): Bot {
    const effectiveWorkingDirectory = storedBot.workingDirectoryOverride
      ?? projectWorkingDirectory(storedBot.projectId)
      ?? join(privateBotsDirectory, storedBot.id)

    return botSchemas.bot.assert({ ...storedBot, effectiveWorkingDirectory })
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

      const storedBot: StoredBot = {
        id: crypto.randomUUID(),
        ...workspace,
        name: input.name,
        provider: input.provider,
        function: input.function,
        createdAt: new Date().toISOString(),
      }
      await privateDirectory(storedBot.id)

      return observability.span(
        { name: "bots.create", context: { botId: storedBot.id, provider: storedBot.provider, ...(storedBot.projectId ? { projectId: storedBot.projectId } : {}) } },
        () => withEffectiveWorkingDirectory(database.bots.create(storedBot)),
      )
    },
    list() {
      const listedBots = database.bots.list().map(withEffectiveWorkingDirectory)

      return botSchemas.botList.assert(listedBots)
    },
    get(rawInput: unknown) {
      const input = botSchemas.idInput.assert(rawInput)
      const storedBot = database.bots.get(input.id)

      return storedBot ? withEffectiveWorkingDirectory(storedBot) : undefined
    },
    async updateWorkspace(rawInput: unknown) {
      const input = botSchemas.updateWorkspaceInput.assert(rawInput)
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
        { name: "bots.workspaceupdate", context: { botId: storedBot.id, ...(input.projectId ? { projectId: input.projectId } : {}) } },
        () => {
          const updated = database.bots.updateWorkspace(storedBot.id, {
            projectId: input.projectId,
            workingDirectoryOverride: input.workingDirectoryOverride,
          })

          if (!updated) {
            throw new Error("Bot not found")
          }

          return withEffectiveWorkingDirectory(updated)
        },
      )
    },
    async resolveWorkingDirectory(rawInput: unknown) {
      const input = botSchemas.idInput.assert(rawInput)
      const storedBot = database.bots.get(input.id)

      if (!storedBot) {
        throw new Error("Bot not found")
      }

      await privateDirectory(storedBot.id)
      const effectiveWorkingDirectory = withEffectiveWorkingDirectory(storedBot).effectiveWorkingDirectory
      await assertAccessibleWorkingDirectory(effectiveWorkingDirectory)

      return effectiveWorkingDirectory
    },
  }
}
