import { describe, expect, test } from "bun:test"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { EngineProcess } from "@src/main/engine-process/engine-process"
import { observation } from "@src/shared/observability/observation"
import { testDirectory } from "../../support/test-directory"

const directory = testDirectory("jots-main-engine-")

describe("EngineProcess", () => {
  test("starts and stops the compiled engine without leaving a child process", async () => {
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
    const engine = new EngineProcess({
      executable: join(directory, "missing-engine"),
      databasePath: join(directory, "test.sqlite"),
    })

    await expect(engine.start()).rejects.toThrow()
    expect(engine.pid).toBeUndefined()
  })
})
