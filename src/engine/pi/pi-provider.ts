import { ModelRuntime } from "@earendil-works/pi-coding-agent"
import type { ProviderAvailability, ProviderModels } from "../../shared/providers"
import type { Observability } from "../observability/observability"

type AvailableModel = { id: string; name: string }

export const codexDefaultModelId = "gpt-5.6-luna"

export function createPiProvider(
  observability: Observability,
  findAvailableModels = async (): Promise<readonly AvailableModel[]> => {
    const runtime = await ModelRuntime.create({ signal: AbortSignal.timeout(15_000) })

    return runtime.getAvailable("openai-codex")
  },
  modelId = codexDefaultModelId,
) {
  let providers: ProviderAvailability[] = []
  let models: ProviderModels[] = []
  let pending: Promise<ProviderAvailability[]> | undefined

  async function refresh() {
    const status = await observability.span(
      { name: "provider.discovery", context: { provider: "codex" } },
      async () => {
        const available = await findAvailableModels()

        models = [{ provider: "codex", default: modelId, models: available.map(({ id, name }) => ({ id, name })) }]

        return available.some((model) => model.id === modelId) ? "available" as const : "unauthenticated" as const
      },
    ).catch(() => "incompatible" as const)

    providers = [{ provider: "codex", status }]

    return providers
  }

  return {
    list() {
      pending ??= refresh().finally(() => {
        pending = undefined
      })

      return pending
    },
    async models() {
      await this.list()

      return structuredClone(models)
    },
    current: () => structuredClone(providers),
  }
}
