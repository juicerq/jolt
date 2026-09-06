import type { Api, AuthInteraction, Model } from "@earendil-works/pi-ai"
import type { ModelRuntime } from "@earendil-works/pi-coding-agent"
import type { ProviderConnection, ProviderName } from "@src/shared/providers"

interface PiProvider { id: string; name: string; defaultModelId: string; connection: ProviderConnection }

export const piProviders: Record<ProviderName, PiProvider> = {
  codex: { id: "openai-codex", name: "Codex", defaultModelId: "gpt-5.6-luna", connection: "subscription" },
  opencode: { id: "opencode-go", name: "OpenCode Go", defaultModelId: "minimax-m3", connection: "api-key" },
}

const discoveryTimeoutMs = 15_000

export interface PiModels {
  refresh(): Promise<void>
  available(provider: ProviderName): Promise<readonly Model<Api>[]>
  resolve(provider: ProviderName, modelId: string | null): Promise<{ model: Model<Api>; modelRuntime: ModelRuntime }>
  login(interaction: AuthInteraction): Promise<void>
  setKey(provider: ProviderName, key: string): Promise<void>
  connected(provider: ProviderName): Promise<boolean>
  disconnect(provider: ProviderName): Promise<void>
}

export function createPiModels(): PiModels {
  let pending: Promise<ModelRuntime> | undefined
  let refreshing: Promise<void> | undefined

  function runtime() {
    pending ??= import("@earendil-works/pi-coding-agent")
      .then((module) => module.ModelRuntime.create({ signal: AbortSignal.timeout(discoveryTimeoutMs) }))
      .catch((error: unknown) => {
        pending = undefined
        throw error
      })

    return pending
  }

  async function available(provider: ProviderName) {
    const modelRuntime = await runtime()

    return modelRuntime.getAvailable(piProviders[provider].id)
  }

  return {
    available,
    async refresh() {
      refreshing ??= (async () => {
        const modelRuntime = await runtime()
        const result = await modelRuntime.refresh({
          providers: Object.values(piProviders).map((provider) => provider.id),
          signal: AbortSignal.timeout(discoveryTimeoutMs),
        })

        if (result.errors.size > 0) {
          throw new Error([...result.errors].map(([provider, error]) => `${provider}: ${error.message}`).join("; "))
        }

        if (result.aborted) {
          throw new Error("Pi model catalog refresh timed out")
        }
      })().finally(() => {
        refreshing = undefined
      })

      await refreshing
    },
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
    async login(interaction) {
      const modelRuntime = await runtime()
      await modelRuntime.login(piProviders.codex.id, "oauth", interaction)
    },
    async setKey(provider, key) {
      const modelRuntime = await runtime()
      await modelRuntime.login(piProviders[provider].id, "api_key", { prompt: async () => key, notify() {} })
    },
    async connected(provider) {
      const modelRuntime = await runtime()
      const credentials = await modelRuntime.listCredentials()

      return credentials.some((credential) => credential.providerId === piProviders[provider].id)
    },
    async disconnect(provider) {
      const modelRuntime = await runtime()

      return modelRuntime.logout(piProviders[provider].id)
    },
  }
}
