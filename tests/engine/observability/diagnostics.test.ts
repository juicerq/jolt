import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { createDiagnostics } from "@src/engine/observability/diagnostics"
import { createObservationSystem } from "@src/engine/observability/observability"
import { testDirectory } from "../../support/test-directory"

const directory = testDirectory("jots-diagnostics-")

describe("Diagnostics", () => {
  test("derives failures, percentiles and slow operations from spans", async () => {
    const system = createObservationSystem({ appSessionId: "session-1", logDirectory: directory, development: false })
    const diagnostics = createDiagnostics({
      source: system.diagnostics,
      versions: { app: "0.0.0", bun: "1.4.0", electron: "44.0.0" },
      processState: () => ({ engine: "ready", main: "ready" }),
      migrationState: () => [1],
      exportDirectory: directory,
      providerState: () => [
        { provider: "codex", status: "available", version: "0.151.0" },
        { provider: "claude", status: "unauthenticated", version: "2.1.250" },
      ],
    })

    system.observability.event({ name: "provider.failed", error: new Error("not authenticated") })
    await system.observability.span({ name: "orpc.health" }, async () => Bun.sleep(2))
    await system.observability.span({ name: "orpc.health" }, async () => Bun.sleep(4))
    await system.observability.flush()

    const report = diagnostics.get()

    expect(report.failures[0]?.name).toBe("provider.failed")
    expect(report.operations[0]).toMatchObject({ name: "orpc.health", count: 2 })
    expect(report.operations[0]?.maximumMs).toBeGreaterThanOrEqual(report.operations[0]?.p95Ms ?? 0)
    expect(report.slowOperations[0]?.name).toBe("orpc.health")
    expect(report.authentication).toEqual({ codex: "authenticated", claude: "unauthenticated" })
  })

  test("exports only sanitized observations and non-sensitive metadata", async () => {
    const system = createObservationSystem({ appSessionId: "session-1", logDirectory: directory, development: false })
    const diagnostics = createDiagnostics({
      source: system.diagnostics,
      versions: { app: "0.0.0", bun: "1.4.0", electron: "44.0.0" },
      processState: () => ({ engine: "ready", main: "ready" }),
      migrationState: () => [1],
      exportDirectory: directory,
    })
    system.observability.event({ name: "engine.started", attributes: { status: "ready", token: "secret" } })
    await system.observability.flush()

    const result = await diagnostics.export()
    const content = readFileSync(result.path, "utf8")

    expect(JSON.parse(content)).toMatchObject({ versions: { app: "0.0.0" }, migrations: [1] })
    expect(content).not.toContain("secret")
    expect(content).not.toContain("token")
  })
})
