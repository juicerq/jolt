import { eventIterator, oc } from "@orpc/contract"
import { type } from "arktype"

export const healthOutput = type({
  runtime: "string",
  pid: "number",
  startedAt: "string",
  databasePath: "string",
})

export const counterOutput = type({
  value: "number",
  updatedAt: "string",
})

export const engineReadyMessage = type({
  type: "'ready'",
  port: "number.integer > 0",
})

const prototypeEvent = type({
  sequence: "number.integer >= 1",
  message: "string",
  emittedAt: "string",
})

const codexProbeOutput = type({
  available: "boolean",
  initialized: "boolean",
  accountType: "string | null",
  accountEmail: "string | null",
  modelCount: "number.integer >= 0",
  defaultModel: "string | null",
})

const claudeProbeOutput = type({
  available: "boolean",
  loggedIn: "boolean",
  authMethod: "string",
  sdkLoaded: "boolean",
  startupAttempted: "boolean",
  startupResult: "string",
  startupCostUsd: "number >= 0",
  startupWasError: "boolean",
})

export const contract = {
  health: oc.output(healthOutput).route({ method: "GET", path: "/health" }),
  counter: {
    read: oc.output(counterOutput).route({ method: "GET", path: "/counter" }),
    increment: oc.output(counterOutput).route({ method: "POST", path: "/counter/increment" }),
  },
  events: oc.output(eventIterator(prototypeEvent)).route({ method: "GET", path: "/events" }),
  probes: {
    codex: oc.output(codexProbeOutput).route({ method: "POST", path: "/probes/codex" }),
    claude: oc.output(claudeProbeOutput).route({ method: "POST", path: "/probes/claude" }),
  },
}

export type Contract = typeof contract
