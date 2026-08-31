import { type } from "arktype"

export const providerName = type.enumerated("codex")
export const providerStatus = type.enumerated("available", "unauthenticated", "incompatible")

export const providerAvailability = type({
  "+": "reject",
  provider: providerName,
  status: providerStatus,
})

export const providerAvailabilityList = providerAvailability.array()

export type ProviderAvailability = typeof providerAvailability.infer
