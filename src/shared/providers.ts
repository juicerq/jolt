import { z } from "zod"

const id = z.string().min(1)

export const providerName = z.enum(["codex"])
export const providerStatus = z.enum(["available", "unauthenticated", "incompatible"])

export const providerAvailability = z.strictObject({
  provider: providerName,
  status: providerStatus,
})

export const providerAvailabilityList = z.array(providerAvailability)
const providerModel = z.strictObject({ id, name: id })
export const providerModels = z.strictObject({ provider: providerName, default: id, models: z.array(providerModel) })
export const providerModelsList = z.array(providerModels)

export type ProviderAvailability = z.infer<typeof providerAvailability>
export type ProviderModels = z.infer<typeof providerModels>
