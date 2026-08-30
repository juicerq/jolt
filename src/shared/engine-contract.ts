import { oc } from "@orpc/contract"
import { type } from "arktype"
import { diagnosticExportResult, diagnosticsReport } from "./observability/diagnostics"
import { externalObservationSpan, observationAttributes, observationContext, observationName } from "./observability/observation"
import { providerAvailabilityList } from "./providers"
import { teamSchemas } from "./teams"

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

const healthOutput = type({
  status: type.enumerated("ready"),
  runtime: "string",
  startedAt: "string",
})

export const engineContract = {
  health: oc.output(healthOutput).route({ method: "GET", path: "/health" }),
  diagnostics: {
    get: oc.output(diagnosticsReport).route({ method: "GET", path: "/diagnostics" }),
    export: oc.output(diagnosticExportResult).route({ method: "POST", path: "/diagnostics/export" }),
  },
  providers: {
    list: oc.output(providerAvailabilityList).route({ method: "GET", path: "/providers" }),
  },
  teams: {
    create: oc.input(teamSchemas.createInput).output(teamSchemas.team).route({ method: "POST", path: "/teams" }),
    list: oc.output(teamSchemas.teamList).route({ method: "GET", path: "/teams" }),
    get: oc.input(teamSchemas.idInput).output(teamSchemas.team).route({ method: "GET", path: "/teams/{id}" }),
    createMember: oc.input(teamSchemas.createMemberInput).output(teamSchemas.member).route({ method: "POST", path: "/teams/{teamId}/members" }),
  },
  observations: {
    rendererSpan: oc.input(externalObservationSpan).route({ method: "POST", path: "/observations/renderer-span" }),
  },
}
