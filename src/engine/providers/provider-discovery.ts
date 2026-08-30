import { providerAvailabilityList, type ProviderAvailability } from "../../shared/providers"
import type { Observability } from "../observability/observability"

export type ProviderProbe = {
  provider: ProviderAvailability["provider"]
  probe(): Promise<ProviderAvailability>
}

export function createProviderDiscovery(observability: Observability, probes: ProviderProbe[]) {
  let providers: ProviderAvailability[] = []
  let pending: Promise<ProviderAvailability[]> | undefined

  async function discover(probe: ProviderProbe) {
    try {
      return await observability.span(
        { name: "provider.discovery", context: { provider: probe.provider } },
        () => probe.probe(),
      )
    } catch {
      return { provider: probe.provider, status: "incompatible" as const }
    }
  }

  async function refresh() {
    const results = await Promise.all(probes.map(discover))
    providers = providerAvailabilityList.assert(results)

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
