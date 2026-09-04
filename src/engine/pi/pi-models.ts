import type { Api, Model } from "@earendil-works/pi-ai"
import type { ModelRuntime } from "@earendil-works/pi-coding-agent"
import type { ProviderConnection, ProviderName } from "@src/shared/providers"

interface PiProvider { id: string; name: string; defaultModelId: string; connection: ProviderConnection }

export const piProviders: Record<ProviderName, PiProvider> = {
  codex: { id: "openai-codex", name: "Codex", defaultModelId: "gpt-5.6-luna", connection: "subscription" },
  opencode: { id: "opencode-go", name: "OpenCode Go", defaultModelId: "minimax-m3", connection: "api-key" },
}

const discoveryTimeoutMs = 15_000

export interface PiModels {
  available(provider: ProviderName): Promise<readonly Model<Api>[]>
  resolve(provider: ProviderName, modelId: string | null): Promise<{ model: Model<Api>; modelRuntime: ModelRuntime }>
  setKey(provider: ProviderName, key: string): Promise<void>
  removeKey(provider: ProviderName): Promise<void>
}

export function createPiModels(): PiModels {
  let pending: Promise<ModelRuntime> | undefined

  function runtime() {
    pending ??= import("@earendil-works/pi-coding-agent")
      .then((module) => module.ModelRuntime.create({ signal: AbortSignal.timeout(discoveryTimeoutMs) }))

    return pending
  }

  async function available(provider: ProviderName) {
    const modelRuntime = await runtime()

    return modelRuntime.getAvailable(piProviders[provider].id)
  }

  return {
    available,
    async resolve(provider, modelId) {
      const catalog = piProviders[provider]
      const wanted = modelId ?? catalog.defaultModelId
      const modelRuntime = await runtime()
      const models = await modelRuntime.getAvailable(catalog.id)
      const model = models.find((candidate) => candidate.id === wanted)

      if (!model) {
        throw new Error(`Pi did not find the ${catalog.name} model ${wanted}`)
      }

      return { model, modelRuntime }
    },
    async setKey(provider, key) {
      const modelRuntime = await runtime()
      await modelRuntime.login(piProviders[provider].id, "api_key", { prompt: async () => key, notify() {} })
    },
    async removeKey(provider) {
      const modelRuntime = await runtime()

      return modelRuntime.logout(piProviders[provider].id)
    },
  }
}
