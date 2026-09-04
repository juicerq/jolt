import { parse } from "../../shared/parse"
import { providerConnectInput, providerDisconnectInput, type ProviderAvailability, type ProviderModels, type ProviderName } from "../../shared/providers"
import type { Observability } from "../observability/observability"
import { detectOpencodeKey } from "./opencode-key"
import { piProviders, type PiModels } from "./pi-models"

const providerNames = Object.keys(piProviders) as ProviderName[]

type Discovery = { availability: ProviderAvailability; models: ProviderModels }

export function createPiProvider(observability: Observability, models: PiModels) {
  let providers: ProviderAvailability[] = []
  let catalogs: ProviderModels[] = []
  let pending: Promise<ProviderAvailability[]> | undefined
  let revision = 0

  async function discover(provider: ProviderName): Promise<Discovery> {
    const catalog = piProviders[provider]
    const shared = { provider, name: catalog.name, connection: catalog.connection }
    const detectedKey = catalog.connection === "api-key" && !!await detectOpencodeKey()
    const available = await observability.span(
      { name: "provider.discovery", context: { provider } },
      () => models.available(provider),
    ).catch(() => undefined)

    if (!available) {
      return { availability: { ...shared, status: "incompatible", detectedKey }, models: { provider, name: catalog.name, default: catalog.defaultModelId, models: [] } }
    }

    const status = available.some((model) => model.id === catalog.defaultModelId) ? "available" as const : "unauthenticated" as const

    return {
      availability: { ...shared, status, detectedKey },
      models: { provider, name: catalog.name, default: catalog.defaultModelId, models: available.map(({ id, name }) => ({ id, name })) },
    }
  }

  async function refresh() {
    const current = ++revision
    const discovered = await Promise.all(providerNames.map(discover))

    if (current !== revision) {
      return providers
    }

    providers = discovered.map((entry) => entry.availability)
    catalogs = discovered.filter((entry) => entry.availability.status === "available").map((entry) => entry.models)

    return providers
  }

  function list() {
    pending ??= refresh().finally(() => {
      pending = undefined
    })

    return pending
  }

  function rediscover() {
    pending = refresh().finally(() => {
      pending = undefined
    })

    return pending
  }

  function keyProvider(provider: ProviderName) {
    const catalog = piProviders[provider]

    if (catalog.connection !== "api-key") {
      throw new Error(`${catalog.name} does not use an API key`)
    }

    return catalog
  }

  return {
    list,
    async models() {
      await list()

      return structuredClone(catalogs)
    },
    current: () => structuredClone(providers),
    async connect(rawInput: unknown) {
      const input = parse(providerConnectInput, rawInput)
      const catalog = keyProvider(input.provider)
      const key = input.key ?? await detectOpencodeKey()

      if (!key) {
        throw new Error(`No ${catalog.name} key found on this computer`)
      }

      await observability.span({ name: "provider.connect", context: { provider: input.provider } }, () => models.setKey(input.provider, key))

      return rediscover()
    },
    async disconnect(rawInput: unknown) {
      const input = parse(providerDisconnectInput, rawInput)
      keyProvider(input.provider)

      await observability.span({ name: "provider.disconnect", context: { provider: input.provider } }, () => models.removeKey(input.provider))

      return rediscover()
    },
  }
}
