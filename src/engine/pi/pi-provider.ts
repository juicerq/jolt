import type { ProviderAvailability, ProviderConnectInput, ProviderModels, ProviderName } from "@src/shared/providers"
import type { Observability } from "../observability/observability"
import { createPiAuthentication } from "./pi-authentication"
import { detectOpencodeKey } from "./opencode-key"
import { piProviders, type PiModels } from "./pi-models"

const providerNames = Object.keys(piProviders) as ProviderName[]

interface Discovery { availability: ProviderAvailability; models: ProviderModels }

export function createPiProvider(observability: Observability, models: PiModels) {
  const authentication = createPiAuthentication(models)
  let providers: ProviderAvailability[] = []
  let catalogs: ProviderModels[] = []
  let pending: Promise<ProviderAvailability[]> | undefined
  let revision = 0

  async function discover(provider: ProviderName): Promise<Discovery> {
    const catalog = piProviders[provider]
    const connected = await models.connected(provider)
    const shared = { provider, name: catalog.name, connection: catalog.connection, connected }
    const detectedKey = catalog.connection === "api-key" && !!await detectOpencodeKey()
    const available = await observability.span(
      { name: "provider.discovery", context: { provider } },
      () => models.available(provider),
    ).catch(() => {})

    if (!available) {
      return { availability: { ...shared, status: "incompatible", detectedKey }, models: { provider, name: catalog.name, default: catalog.defaultModelId, models: [] } }
    }

    const unavailableStatus = connected ? "incompatible" as const : "unauthenticated" as const
    const status = available.some((model) => model.id === catalog.defaultModelId) ? "available" as const : unavailableStatus

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

  function rediscover() {
    pending = refresh().finally(() => {
      pending = undefined
    })

    return pending
  }

  function list() {
    return pending ?? rediscover()
  }

  function keyProvider(provider: ProviderName) {
    const catalog = piProviders[provider]

    if (catalog.connection !== "api-key") {
      throw new Error(`${catalog.name} does not use an API key`)
    }

    return catalog
  }

  return {
    authentication,
    async refreshModels() {
      await observability.span({ name: "provider.catalogrefresh" }, () => models.refresh()).catch(() => {})
    },
    list,
    async models() {
      await list()

      return structuredClone(catalogs)
    },
    current: () => structuredClone(providers),
    async connect(input: ProviderConnectInput) {
      const catalog = keyProvider(input.provider)
      const key = input.key ?? await detectOpencodeKey()

      if (!key) {
        throw new Error(`No ${catalog.name} key found on this computer`)
      }

      await observability.span({ name: "provider.connect", context: { provider: input.provider } }, () => models.setKey(input.provider, key))

      return rediscover()
    },
    async disconnect(provider: ProviderName) {
      await observability.span({ name: "provider.disconnect", context: { provider } }, () => models.disconnect(provider))

      return rediscover()
    },
  }
}
