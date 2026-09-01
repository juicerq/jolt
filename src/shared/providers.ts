import { type } from "arktype"

export const providerName = type.enumerated("codex")
export const providerStatus = type.enumerated("available", "unauthenticated", "incompatible")

export const providerAvailability = type({
  "+": "reject",
  provider: providerName,
  status: providerStatus,
})

export const providerAvailabilityList = providerAvailability.array()
const providerModel = type({ "+": "reject", id: "string > 0", name: "string > 0" })
export const providerModels = type({ "+": "reject", provider: providerName, default: "string > 0", models: providerModel.array() })
export const providerModelsList = providerModels.array()

export type ProviderAvailability = typeof providerAvailability.infer
export type ProviderModels = typeof providerModels.infer
