import { ModelRuntime } from "@earendil-works/pi-coding-agent"
import type { ProviderAvailability } from "../../shared/providers"
import type { Observability } from "../observability/observability"

type AvailableModel = { id: string }

export function createPiProvider(
  observability: Observability,
  findAvailableModels = async (): Promise<readonly AvailableModel[]> => {
    const runtime = await ModelRuntime.create({ signal: AbortSignal.timeout(15_000) })

    return runtime.getAvailable("openai-codex")
  },
  modelId = "gpt-5.6-luna",
) {
  let providers: ProviderAvailability[] = []
  let pending: Promise<ProviderAvailability[]> | undefined

  async function refresh() {
    const status = await observability.span(
      { name: "provider.discovery", context: { provider: "codex" } },
      async () => {
        const models = await findAvailableModels()

        return models.some((model) => model.id === modelId) ? "available" as const : "unauthenticated" as const
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
    current: () => structuredClone(providers),
  }
}
