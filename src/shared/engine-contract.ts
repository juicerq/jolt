import { eventIterator, oc } from "@orpc/contract"
import { type } from "arktype"
import { diagnosticExportResult, diagnosticsReport } from "./observability/diagnostics"
import { externalObservationSpan, observationAttributes, observationContext, observationName } from "./observability/observation"
import { providerAvailabilityList } from "./providers"
import { botSchemas } from "./bots"
import { conversationSchemas } from "./conversations"
import { projectSchemas } from "./projects"

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
  projects: {
    create: oc.input(projectSchemas.createInput).output(projectSchemas.project).route({ method: "POST", path: "/projects" }),
    list: oc.output(projectSchemas.groupedList).route({ method: "GET", path: "/projects" }),
  },
  bots: {
    create: oc.input(botSchemas.createInput).output(botSchemas.bot).route({ method: "POST", path: "/bots" }),
    list: oc.output(botSchemas.botList).route({ method: "GET", path: "/bots" }),
    get: oc.input(botSchemas.idInput).output(botSchemas.bot).route({ method: "GET", path: "/bots/{id}" }),
    updateWorkspace: oc.input(botSchemas.updateWorkspaceInput).output(botSchemas.bot).route({ method: "POST", path: "/bots/{id}/workspace" }),
  },
  conversations: {
    history: oc.input(conversationSchemas.botInput).output(conversationSchemas.messageList).route({ method: "GET", path: "/bots/{botId}/messages" }),
    send: oc.input(conversationSchemas.sendInput).output(eventIterator(conversationSchemas.event)).route({ method: "POST", path: "/bots/{botId}/messages" }),
    abort: oc.input(conversationSchemas.botInput).route({ method: "POST", path: "/bots/{botId}/abort" }),
  },
  observations: {
    rendererSpan: oc.input(externalObservationSpan).route({ method: "POST", path: "/observations/renderer-span" }),
  },
}
