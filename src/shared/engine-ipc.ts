import { z } from "zod"
import { externalObservationSpan, observationAttributes, observationContext, observationName } from "./observability/observation"

export const engineReadyMessage = z.object({
  type: z.literal("ready"),
  port: z.int().min(1),
})

export const loopbackHttpUrl = z.string().refine((value) => {
  try {
    const url = new URL(value)

    return url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost")
  } catch {
    return false
  }
})

export const engineConnection = z.object({
  url: loopbackHttpUrl,
  token: z.string().min(1),
})

export const forwardedObservationEvent = z.strictObject({
  type: z.literal("observation"),
  name: observationName,
  attributes: observationAttributes.optional(),
  context: observationContext.optional(),
})

export const forwardedObservationSpan = z.strictObject({
  type: z.literal("span"),
  span: externalObservationSpan,
})

export const forwardedObservation = z.discriminatedUnion("type", [forwardedObservationEvent, forwardedObservationSpan])

export type EngineReadyMessage = z.infer<typeof engineReadyMessage>
export type EngineConnection = z.infer<typeof engineConnection>
export type ForwardedObservationEvent = z.infer<typeof forwardedObservationEvent>
export type ForwardedObservation = z.infer<typeof forwardedObservation>
