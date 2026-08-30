import { describe, expect, test } from "bun:test"
import { mkdirSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { createObservationSystem } from "@src/engine/observability/observability"
import { testDirectory } from "../../support/test-directory"

const directory = testDirectory("jots-observability-")

describe("Observability", () => {
  test("exposes only event, span and flush", () => {
    const { observability } = createObservationSystem({
      appSessionId: "session-1",
      logDirectory: directory,
      development: false,
    })

    expect(Object.keys(observability).toSorted()).toEqual(["event", "flush", "span"])
  })

  test("records a closed event envelope and drops forbidden attributes", async () => {
    mkdirSync(directory, { recursive: true })
    const { observability } = createObservationSystem({
      appSessionId: "session-1",
      logDirectory: directory,
      development: false,
    })

    observability.event({
      name: "engine.started",
      attributes: {
        process: "engine",
        status: "ready",
        prompt: "do not persist",
        token: "secret",
        environment: { PRIVATE_KEY: "environment-secret" },
        headers: { cookie: "header-secret" },
      },
    })
    await observability.flush()

    const [file] = readdirSync(directory).filter((entry) => entry.endsWith(".jsonl"))
    const persisted = readFileSync(join(directory, file), "utf8")
    const observation = JSON.parse(persisted)

    expect(observation).toMatchObject({
      kind: "event",
      name: "engine.started",
      appSessionId: "session-1",
      attributes: { process: "engine", status: "ready" },
    })
    expect(persisted).not.toContain("do not persist")
    expect(persisted).not.toContain("secret")
    expect(persisted).not.toContain("environment-secret")
    expect(persisted).not.toContain("header-secret")
  })

  test("drops invalid allowed attributes without interrupting the caller", async () => {
    let stderr = ""
    const originalWrite = process.stderr.write.bind(process.stderr)
    process.stderr.write = ((value: string | Uint8Array) => {
      stderr += String(value)

      return true
    }) as typeof process.stderr.write
    const { observability, diagnostics } = createObservationSystem({
      appSessionId: "session-1",
      logDirectory: directory,
      development: false,
    })

    try {
      expect(() => observability.event({ name: "engine.started", attributes: { count: Number.NaN, status: "ready" } })).not.toThrow()
      await observability.flush()
    } finally {
      process.stderr.write = originalWrite
    }

    expect(diagnostics.recent()[0]?.attributes).toEqual({ status: "ready" })
    expect(stderr).toContain("Invalid observation attribute dropped")
  })

  test("propagates trace and parent spans across asynchronous work", async () => {
    const { observability, diagnostics } = createObservationSystem({
      appSessionId: "session-1",
      logDirectory: directory,
      development: false,
    })

    await observability.span({ name: "orpc.health", context: { traceId: "trace-renderer" } }, async () => {
      await Promise.resolve()
      await observability.span({ name: "database.transaction" }, async () => {
        observability.event({ name: "subprocess.started", attributes: { process: "fixture" } })
      })
    })
    await observability.flush()

    const recent = diagnostics.recent()
    const databaseSpan = recent.find((item) => item.name === "database.transaction")
    const subprocessEvent = recent.find((item) => item.name === "subprocess.started")
    const rootSpan = recent.find((item) => item.name === "orpc.health")

    expect(rootSpan?.traceId).toBe("trace-renderer")
    expect(databaseSpan?.parentSpanId).toBe(rootSpan?.spanId)
    expect(subprocessEvent?.spanId).toBe(databaseSpan?.spanId)
  })

  test("normalizes failures without interrupting the operation", async () => {
    const { observability, diagnostics } = createObservationSystem({
      appSessionId: "session-1",
      logDirectory: directory,
      development: false,
    })

    expect(() =>
      observability.span({ name: "provider.start" }, () => {
        const error = Object.assign(new Error("provider unavailable for user@example.com with Bearer abc123"), { code: "ENOENT", token: "secret" })

        throw error
      }),
    ).toThrow("provider unavailable")
    await observability.flush()

    const failure = diagnostics.recent().find((item) => item.name === "provider.start")

    expect(failure?.error).toMatchObject({ type: "Error", code: "ENOENT", message: "provider unavailable for [redacted-email] with Bearer [redacted]" })
    expect(JSON.stringify(failure)).not.toContain("secret")
    expect(JSON.stringify(failure)).not.toContain("abc123")
    expect(JSON.stringify(failure)).not.toContain("user@example.com")
  })

  test("marks non-Error and undefined rejections as redacted failures", async () => {
    const { observability, diagnostics } = createObservationSystem({
      appSessionId: "session-1",
      logDirectory: directory,
      development: false,
    })

    expect(() => observability.span({ name: "provider.stringfailure" }, () => { throw "token=private-value" })).toThrow()
    await expect(observability.span({ name: "provider.undefinedfailure" }, () => Promise.reject(undefined))).rejects.toBeUndefined()
    const unrepresentable = Object.create(null)
    expect(() => observability.span({ name: "provider.unknownfailure" }, () => { throw unrepresentable })).toThrow()
    await observability.flush()

    const stringFailure = diagnostics.recent().find((item) => item.name === "provider.stringfailure")
    const undefinedFailure = diagnostics.recent().find((item) => item.name === "provider.undefinedfailure")
    const unknownFailure = diagnostics.recent().find((item) => item.name === "provider.unknownfailure")

    expect(stringFailure).toMatchObject({ level: "error", outcome: "error", error: { message: "token=[redacted]" } })
    expect(undefinedFailure).toMatchObject({ level: "error", outcome: "error", error: { message: "undefined" } })
    expect(unknownFailure).toMatchObject({ level: "error", outcome: "error", error: { message: "Unrepresentable error" } })
    expect(JSON.stringify(stringFailure)).not.toContain("private-value")
  })

  test("rotates JSONL files at the configured size", async () => {
    const { observability } = createObservationSystem({
      appSessionId: "session-1",
      logDirectory: directory,
      development: false,
      maxFileBytes: 250,
      maxFiles: 2,
    })

    for (let index = 0; index < 8; index++) {
      observability.event({ name: "engine.tick", attributes: { count: index } })
    }
    await observability.flush()

    const files = readdirSync(directory).filter((entry) => entry.endsWith(".jsonl"))

    expect(files.length).toBe(2)
  })

  test("reports a rotation failure without interrupting the caller", async () => {
    let stderr = ""
    const originalWrite = process.stderr.write.bind(process.stderr)
    process.stderr.write = ((value: string | Uint8Array) => {
      stderr += String(value)

      return true
    }) as typeof process.stderr.write
    const { observability } = createObservationSystem({
      appSessionId: "session-1",
      logDirectory: directory,
      development: false,
      maxFileBytes: 1,
      maxFiles: 2,
    })
    observability.event({ name: "engine.initialized" })
    await observability.flush()
    mkdirSync(join(directory, "observations.1.jsonl"), { recursive: true })

    try {
      expect(() => observability.event({ name: "engine.started" })).not.toThrow()
      await observability.flush()
    } finally {
      process.stderr.write = originalWrite
    }

    expect(stderr).toContain("Observability output failed")
  })

  test("continues when an output fails and reports the failure to stderr", async () => {
    const written: string[] = []
    let stderr = ""
    const originalWrite = process.stderr.write.bind(process.stderr)
    process.stderr.write = ((value: string | Uint8Array) => {
      stderr += String(value)

      return true
    }) as typeof process.stderr.write
    const { observability } = createObservationSystem({
      appSessionId: "session-1",
      logDirectory: directory,
      development: false,
      outputs: [
        { write() { throw new Error("disk unavailable") }, async flush() {} },
        { write(item) { written.push(item.name) }, async flush() {} },
      ],
    })

    try {
      observability.event({ name: "engine.started" })
      await observability.flush()
    } finally {
      process.stderr.write = originalWrite
    }

    expect(written).toEqual(["engine.started"])
    expect(stderr).toContain("disk unavailable")
  })

  test("writes JSON to the console only in development", async () => {
    let stdout = ""
    const originalWrite = process.stdout.write.bind(process.stdout)
    process.stdout.write = ((value: string | Uint8Array) => {
      stdout += String(value)

      return true
    }) as typeof process.stdout.write
    const development = createObservationSystem({
      appSessionId: "session-1",
      logDirectory: join(directory, "development"),
      development: true,
    })
    const production = createObservationSystem({
      appSessionId: "session-1",
      logDirectory: join(directory, "production"),
      development: false,
    })

    try {
      development.observability.event({ name: "engine.development" })
      production.observability.event({ name: "engine.production" })
      await Promise.all([development.observability.flush(), production.observability.flush()])
    } finally {
      process.stdout.write = originalWrite
    }

    expect(stdout).toContain("engine.development")
    expect(stdout).not.toContain("engine.production")
  })
})
