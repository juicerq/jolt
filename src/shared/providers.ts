import { z } from "zod"

const id = z.string().min(1)

export const providerName = z.enum(["codex", "opencode"])
export const providerStatus = z.enum(["available", "unauthenticated", "incompatible"])
export const providerConnection = z.enum(["subscription", "api-key"])

export const providerAvailability = z.strictObject({
  provider: providerName,
  name: id,
  status: providerStatus,
  connection: providerConnection,
  detectedKey: z.boolean(),
})

export const providerAvailabilityList = z.array(providerAvailability)
const providerModel = z.strictObject({ id, name: id })
export const providerModels = z.strictObject({ provider: providerName, name: id, default: id, models: z.array(providerModel) })
export const providerModelsList = z.array(providerModels)
export const providerConnectInput = z.strictObject({ provider: providerName, key: id.optional() })
export const providerDisconnectInput = z.strictObject({ provider: providerName })

export type ProviderAvailability = z.infer<typeof providerAvailability>
export type ProviderConnection = z.infer<typeof providerConnection>
export type ProviderModels = z.infer<typeof providerModels>
export type ProviderName = z.infer<typeof providerName>
