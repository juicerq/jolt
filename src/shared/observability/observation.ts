import { z } from "zod"

const id = z.string().min(1)

export const observationName = z.string().regex(/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/)
const provider = z.literal("codex")
const outcome = z.enum(["ok", "error"])
const level = z.enum(["info", "error"])

export const observationAttributes = z.strictObject({
  bytes: z.number().optional(),
  code: z.string().optional(),
  count: z.number().optional(),
  method: z.string().optional(),
  port: z.number().optional(),
  process: z.string().optional(),
  runtime: z.string().optional(),
  state: z.string().optional(),
  status: z.string().optional(),
  version: z.string().optional(),
})

export const observationContext = z.strictObject({
  appSessionId: id.optional(),
  traceId: id.optional(),
  spanId: id.optional(),
  parentSpanId: id.optional(),
  leaderBotId: id.optional(),
  callerBotId: id.optional(),
  botId: id.optional(),
  projectId: id.optional(),
  taskId: id.optional(),
  pluginId: id.optional(),
  provider: provider.optional(),
})

export const normalizedObservationError = z.strictObject({
  type: z.string(),
  message: z.string(),
  code: z.string().optional(),
  stack: z.string().optional(),
})

const baseObservation = {
  name: observationName,
  timestamp: z.string(),
  level,
  attributes: observationAttributes.optional(),
  error: normalizedObservationError.optional(),
  appSessionId: id.optional(),
  traceId: id.optional(),
  spanId: id.optional(),
  parentSpanId: id.optional(),
  leaderBotId: id.optional(),
  callerBotId: id.optional(),
  botId: id.optional(),
  projectId: id.optional(),
  taskId: id.optional(),
  pluginId: id.optional(),
  provider: provider.optional(),
}

const eventObservation = z.strictObject({
  ...baseObservation,
  kind: z.literal("event"),
})
const spanObservation = z.strictObject({
  ...baseObservation,
  kind: z.literal("span"),
  durationMs: z.number(),
  outcome,
})

export const observation = z.discriminatedUnion("kind", [eventObservation, spanObservation])

export const externalObservationSpan = z.strictObject({
  name: observationName,
  timestamp: z.string(),
  durationMs: z.number(),
  outcome,
  traceId: id,
  spanId: id,
  parentSpanId: id.optional(),
  attributes: observationAttributes.optional(),
  error: normalizedObservationError.optional(),
})

export type Observation = z.infer<typeof observation>
export type ObservationContext = z.infer<typeof observationContext>
export type ObservationAttributes = z.infer<typeof observationAttributes>
export type NormalizedObservationError = z.infer<typeof normalizedObservationError>
export type ExternalObservationSpan = z.infer<typeof externalObservationSpan>
