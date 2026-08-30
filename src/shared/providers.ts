import { type } from "arktype"

export const providerName = type.enumerated("codex", "claude")
export const providerStatus = type.enumerated("available", "unauthenticated", "missing", "incompatible")

export const providerAvailability = type({
  "+": "reject",
  provider: providerName,
  status: providerStatus,
  "version?": "string > 0",
})

export const providerAvailabilityList = providerAvailability.array()

export type ProviderAvailability = typeof providerAvailability.infer
