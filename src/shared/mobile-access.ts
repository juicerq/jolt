import { z } from "zod"

export const defaultEnginePort = 4141

export const mobileAccessSettings = z.object({
  enabled: z.boolean().default(false),
  hostname: z.string().nullable().default(null),
})

export const mobileAccessUpdate = z.strictObject({ enabled: z.boolean() })

const mobileAccess = z.strictObject({
  hostname: z.string().nullable(),
  targetPort: z.int(),
  enabled: z.boolean(),
  onBattery: z.boolean(),
  link: z.string().nullable(),
  failure: z.strictObject({ message: z.string(), enableUrl: z.string().nullable() }).nullable(),
})

export type MobileAccessSettings = z.infer<typeof mobileAccessSettings>
export type MobileAccessUpdate = z.infer<typeof mobileAccessUpdate>
export type MobileAccess = z.infer<typeof mobileAccess>
