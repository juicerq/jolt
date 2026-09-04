import { z } from "zod"
import { observation } from "./observation"

export const processState = z.enum(["unknown", "starting", "ready", "stopping", "stopped", "failed"])
const authenticationState = z.enum(["unknown", "authenticated", "unauthenticated"])

export const diagnosticsReport = z.strictObject({
  generatedAt: z.string(),
  logPath: z.string(),
  processes: z.strictObject({
    engine: processState,
    main: processState,
  }),
  versions: z.strictObject({
    app: z.string(),
    bun: z.string(),
    electron: z.string(),
  }),
  authentication: z.strictObject({
    codex: authenticationState,
    opencode: authenticationState,
  }),
  failures: z.array(observation),
  operations: z.array(z.strictObject({
    name: z.string(),
    count: z.number(),
    p50Ms: z.number(),
    p95Ms: z.number(),
    maximumMs: z.number(),
  })),
  slowOperations: z.array(z.strictObject({
    name: z.string(),
    durationMs: z.number(),
    timestamp: z.string(),
    traceId: z.string().optional(),
  })),
})

export const diagnosticExportResult = z.strictObject({
  path: z.string(),
})

export type DiagnosticsReport = z.infer<typeof diagnosticsReport>
export type ProcessState = z.infer<typeof processState>
