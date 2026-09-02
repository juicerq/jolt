import { type } from "arktype"
import { externalObservationSpan, observationAttributes, observationContext, observationName } from "./observability/observation"

export const engineReadyMessage = type({
  type: type.enumerated("ready"),
  port: "number.integer > 0",
})

export const loopbackHttpUrl = type("string").narrow((value) => {
  try {
    const url = new URL(value)

    return url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost")
  } catch {
    return false
  }
})

export const engineConnection = type({
  url: loopbackHttpUrl,
  token: "string > 0",
})

export const forwardedObservationEvent = type({
  "+": "reject",
  type: type.enumerated("observation"),
  name: observationName,
  "attributes?": observationAttributes,
  "context?": observationContext,
})

export const forwardedObservationSpan = type({
  "+": "reject",
  type: type.enumerated("span"),
  span: externalObservationSpan,
})

export const forwardedObservation = forwardedObservationEvent.or(forwardedObservationSpan)
