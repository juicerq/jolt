import { z } from "zod"
import { id } from "./ids"

export const providerName = z.enum(["codex", "opencode"])
const providerStatus = z.enum(["available", "unauthenticated", "incompatible"])
const providerConnection = z.enum(["subscription", "api-key"])

const providerAvailability = z.strictObject({
  provider: providerName,
  name: id,
  status: providerStatus,
  connection: providerConnection,
  detectedKey: z.boolean(),
  connected: z.boolean(),
})

export const providerAvailabilityList = z.array(providerAvailability)
const providerModel = z.strictObject({ id, name: id })
const providerModels = z.strictObject({ provider: providerName, name: id, default: id, models: z.array(providerModel) })
export const providerModelsList = z.array(providerModels)
export const providerConnectInput = z.strictObject({ provider: providerName, key: id.optional() })
export const providerDisconnectInput = z.strictObject({ provider: providerName })

export type ProviderAvailability = z.infer<typeof providerAvailability>
export type ProviderConnection = z.infer<typeof providerConnection>
export type ProviderModels = z.infer<typeof providerModels>
export type ProviderName = z.infer<typeof providerName>

export const providerLoginInput = z.strictObject({ id })
export const providerLoginReply = z.strictObject({ id, url: z.url().max(8192) })
export const providerLogin = z.strictObject({
  id,
  status: z.enum(["pending", "connected", "failed"]),
  manual: z.boolean(),
  url: z.url().optional(),
  message: id.optional(),
})
export type ProviderLogin = z.infer<typeof providerLogin>
export type ProviderConnectInput = z.infer<typeof providerConnectInput>
export type ProviderLoginReply = z.infer<typeof providerLoginReply>
