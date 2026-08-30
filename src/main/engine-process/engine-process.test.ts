import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { observation } from "../../shared/observability/observation"
import { EngineProcess } from "./engine-process"

const directories: string[] = []

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe("EngineProcess", () => {
  test("starts and stops the compiled engine without leaving a child process", async () => {
    const directory = mkdtempSync(join(tmpdir(), "bot-teams-supervisor-test-"))
    directories.push(directory)
    const engine = new EngineProcess({
      executable: join(process.cwd(), "dist-engine", "bot-teams-engine"),
      databasePath: join(directory, "test.sqlite"),
    })
    const connection = await engine.start()

    const response = await fetch(`${connection.url}/health`, {
      headers: { authorization: `Bearer ${connection.token}` },
    })
    const pid = engine.pid

    expect(response.status).toBe(200)
    expect(pid).toBeNumber()

    await engine.event({ name: "main.stopped", attributes: { process: "main", status: "stopping" } })
    await engine.stop()

    expect(() => process.kill(pid!, 0)).toThrow()
    const logFile = readdirSync(join(directory, "logs")).find((entry) => entry.endsWith(".jsonl"))
    const observations = readFileSync(join(directory, "logs", logFile!), "utf8")
      .trim()
      .split("\n")
      .map((line) => observation.assert(JSON.parse(line)))

    expect(observations.some((item) => item.name === "main.startup" && item.kind === "span" && item.durationMs > 0)).toBe(true)
    expect(observations.some((item) => item.name === "main.shutdown" && item.kind === "span" && item.durationMs >= 0)).toBe(true)
  })

  test("reports an unexpected exit after readiness", async () => {
    const directory = mkdtempSync(join(tmpdir(), "bot-teams-supervisor-exit-test-"))
    directories.push(directory)
    let resolveExit: (error: Error) => void = () => undefined
    const unexpectedExit = new Promise<Error>((resolve) => {
      resolveExit = resolve
    })
    const engine = new EngineProcess({
      executable: join(process.cwd(), "dist-engine", "bot-teams-engine"),
      databasePath: join(directory, "test.sqlite"),
      onUnexpectedExit: resolveExit,
    })
    await engine.start()
    const pid = engine.pid

    process.kill(pid!, "SIGKILL")
    const error = await unexpectedExit

    expect(error.message).toContain("exited unexpectedly")
    expect(engine.pid).toBeUndefined()
    expect(() => process.kill(pid!, 0)).toThrow()
  })

  test("rejects startup when the executable cannot spawn", async () => {
    const directory = mkdtempSync(join(tmpdir(), "bot-teams-supervisor-spawn-test-"))
    directories.push(directory)
    const engine = new EngineProcess({
      executable: join(directory, "missing-engine"),
      databasePath: join(directory, "test.sqlite"),
    })

    await expect(engine.start()).rejects.toThrow()
    expect(engine.pid).toBeUndefined()
  })
})
