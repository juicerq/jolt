import { type } from "arktype"

export const observationName = type("string").narrow((value) => /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/.test(value))
const provider = type.enumerated("codex", "claude")
const outcome = type.enumerated("ok", "error")
const level = type.enumerated("info", "error")

export const observationAttributes = type({
  "+": "reject",
  "bytes?": "number",
  "code?": "string",
  "count?": "number",
  "method?": "string",
  "port?": "number",
  "process?": "string",
  "runtime?": "string",
  "state?": "string",
  "status?": "string",
  "version?": "string",
})

export const observationContext = type({
  "+": "reject",
  "appSessionId?": "string > 0",
  "traceId?": "string > 0",
  "spanId?": "string > 0",
  "parentSpanId?": "string > 0",
  "leaderBotId?": "string > 0",
  "botId?": "string > 0",
  "taskId?": "string > 0",
  "provider?": provider,
})

export const normalizedObservationError = type({
  "+": "reject",
  type: "string",
  message: "string",
  "code?": "string",
  "stack?": "string",
})

const baseObservation = {
  "+": "reject" as const,
  name: observationName,
  timestamp: "string" as const,
  level,
  "attributes?": observationAttributes,
  "error?": normalizedObservationError,
  "appSessionId?": "string > 0" as const,
  "traceId?": "string > 0" as const,
  "spanId?": "string > 0" as const,
  "parentSpanId?": "string > 0" as const,
  "leaderBotId?": "string > 0" as const,
  "botId?": "string > 0" as const,
  "taskId?": "string > 0" as const,
  "provider?": provider,
}

const eventObservation = type({
  ...baseObservation,
  kind: type.enumerated("event"),
})
const spanObservation = type({
  ...baseObservation,
  kind: type.enumerated("span"),
  durationMs: "number",
  outcome,
})

export const observation = eventObservation.or(spanObservation)

export const externalObservationSpan = type({
  "+": "reject",
  name: observationName,
  timestamp: "string",
  durationMs: "number",
  outcome,
  traceId: "string > 0",
  spanId: "string > 0",
  "parentSpanId?": "string > 0",
  "attributes?": observationAttributes,
  "error?": normalizedObservationError,
})

export type Observation = typeof observation.infer
export type ObservationContext = typeof observationContext.infer
export type ObservationAttributes = typeof observationAttributes.infer
export type NormalizedObservationError = typeof normalizedObservationError.infer
export type ExternalObservationSpan = typeof externalObservationSpan.infer
