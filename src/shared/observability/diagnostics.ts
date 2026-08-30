import { type } from "arktype"
import { observation } from "./observation"

export const processState = type.enumerated("unknown", "starting", "ready", "stopping", "stopped", "failed")
const authenticationState = type.enumerated("unknown", "authenticated", "unauthenticated")

export const diagnosticsReport = type({
  "+": "reject",
  generatedAt: "string",
  logPath: "string",
  processes: {
    "+": "reject",
    engine: processState,
    main: processState,
  },
  versions: {
    "+": "reject",
    app: "string",
    bun: "string",
    electron: "string",
  },
  authentication: {
    "+": "reject",
    codex: authenticationState,
    claude: authenticationState,
  },
  failures: observation.array(),
  operations: type({
    "+": "reject",
    name: "string",
    count: "number",
    p50Ms: "number",
    p95Ms: "number",
    maximumMs: "number",
  }).array(),
  slowOperations: type({
    "+": "reject",
    name: "string",
    durationMs: "number",
    timestamp: "string",
    "traceId?": "string",
  }).array(),
})

export const diagnosticExportResult = type({
  "+": "reject",
  path: "string",
})

export type DiagnosticsReport = typeof diagnosticsReport.infer
