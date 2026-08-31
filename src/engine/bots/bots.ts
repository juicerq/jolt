import { botSchemas, type Bot } from "../../shared/bots"
import type { ProviderAvailability } from "../../shared/providers"
import type { Observability } from "../observability/observability"
import type { AppDatabase } from "../persistence/database"

type BotsDependencies = { database: AppDatabase; observability: Observability; providers: { list(): Promise<ProviderAvailability[]> } }

export function createBots({ database, observability, providers }: BotsDependencies) {
  return {
    async create(rawInput: unknown) {
      const input = botSchemas.createInput.assert(rawInput)
      const availableProviders = await providers.list()
      const selectedProvider = availableProviders.find((provider) => provider.provider === input.provider)

      if (selectedProvider?.status !== "available") {
        throw new Error(`Provider ${input.provider} is not available`)
      }

      const bot: Bot = { id: crypto.randomUUID(), leaderBotId: null, ...input, createdAt: new Date().toISOString() }

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
  }
}
