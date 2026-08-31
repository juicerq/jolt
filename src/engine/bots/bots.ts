import { access, mkdir, stat } from "node:fs/promises"
import { constants } from "node:fs"
import { isAbsolute, join } from "node:path"
import { botSchemas, type Bot } from "../../shared/bots"
import type { ProviderAvailability } from "../../shared/providers"
import type { Observability } from "../observability/observability"
import type { AppDatabase } from "../persistence/database"

type BotsDependencies = { database: AppDatabase; observability: Observability; privateBotsDirectory: string; providers: { list(): Promise<ProviderAvailability[]> } }

export function createBots({ database, observability, privateBotsDirectory, providers }: BotsDependencies) {
  async function assertAccessibleDirectory(path: string) {
    if (!isAbsolute(path)) {
      throw new Error("Working directory is not accessible")
    }

    const directory = await stat(path).catch(() => undefined)

    if (!directory?.isDirectory()) {
      throw new Error("Working directory is not accessible")
    }

    await access(path, constants.R_OK | constants.W_OK).catch(() => {
      throw new Error("Working directory is not accessible")
    })
  }

  async function privateDirectory(botId: string) {
    const path = join(privateBotsDirectory, botId)
    await mkdir(path, { recursive: true })

    return path
  }

  return {
    async create(rawInput: unknown) {
      const input = botSchemas.createInput.assert(rawInput)
      const availableProviders = await providers.list()
      const selectedProvider = availableProviders.find((provider) => provider.provider === input.provider)

      if (selectedProvider?.status !== "available") {
        throw new Error(`Provider ${input.provider} is not available`)
      }

      if (input.workingDirectory) {
        await assertAccessibleDirectory(input.workingDirectory)
      }

      const bot: Bot = { id: crypto.randomUUID(), leaderBotId: null, ...input, workingDirectory: input.workingDirectory ?? null, createdAt: new Date().toISOString() }

      if (!bot.workingDirectory) {
        await privateDirectory(bot.id)
      }

      return observability.span({ name: "bots.create", context: { botId: bot.id, provider: bot.provider } }, () => database.bots.create(bot))
    },
    list() {
      return botSchemas.botList.assert(database.bots.list())
    },
    get(rawInput: unknown) {
      const input = botSchemas.idInput.assert(rawInput)
      const bot = database.bots.get(input.id)

      return bot ? botSchemas.bot.assert(bot) : undefined
    },
    async updateWorkingDirectory(rawInput: unknown) {
      const input = botSchemas.updateWorkingDirectoryInput.assert(rawInput)
      const bot = database.bots.get(input.id)

      if (!bot) {
        throw new Error("Bot not found")
      }

      if (input.workingDirectory) {
        await assertAccessibleDirectory(input.workingDirectory)
      } else {
        await privateDirectory(bot.id)
      }

      return observability.span({ name: "bots.workingdirectoryupdate", context: { botId: bot.id } }, () => {
        const updated = database.bots.updateWorkingDirectory(bot.id, input.workingDirectory)

        if (!updated) {
          throw new Error("Bot not found")
        }

        return updated
      })
    },
    async resolveWorkingDirectory(rawInput: unknown) {
      const input = botSchemas.idInput.assert(rawInput)
      const bot = database.bots.get(input.id)

      if (!bot) {
        throw new Error("Bot not found")
      }

      const path = bot.workingDirectory ?? await privateDirectory(bot.id)
      await assertAccessibleDirectory(path)

      return path
    },
  }
}
