import { afterEach, describe, expect, test } from "bun:test"
import { existsSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { engineReadyMessage } from "../shared/engine-contract"

const directories: string[] = []

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe("compiled Bun Engine", () => {
  test("requires its token, migrates its database, and exits on SIGTERM", async () => {
    const directory = mkdtempSync(join(tmpdir(), "bot-teams-engine-test-"))
    const databasePath = join(directory, "test.sqlite")
    directories.push(directory)
    let resolveReady: (message: typeof engineReadyMessage.infer) => void = () => undefined
    const ready = new Promise<typeof engineReadyMessage.infer>((resolve) => {
      resolveReady = resolve
    })
    const child = Bun.spawn([join(process.cwd(), "dist-engine", "bot-teams-engine")], {
      env: {
        BOT_TEAMS_ENGINE_TOKEN: "test-token",
        BOT_TEAMS_DATABASE_PATH: databasePath,
      },
      cwd: directory,
      stdout: "pipe",
      stderr: "pipe",
      ipc(message) {
        resolveReady(engineReadyMessage.assert(message))
      },
    })
    const message = await ready
    const preflight = await fetch(`http://127.0.0.1:${message.port}/rpc/health`, {
      method: "OPTIONS",
      headers: {
        origin: "http://localhost:5173",
        "access-control-request-method": "GET",
        "access-control-request-headers": "authorization",
      },
    })
    const filePreflight = await fetch(`http://127.0.0.1:${message.port}/rpc/health`, {
      method: "OPTIONS",
      headers: {
        origin: "null",
        "access-control-request-method": "GET",
        "access-control-request-headers": "authorization",
      },
    })
    const unauthorized = await fetch(`http://127.0.0.1:${message.port}/rpc/health`)
    const authorized = await fetch(`http://127.0.0.1:${message.port}/rpc/health`, {
      headers: { authorization: "Bearer test-token", origin: "http://localhost:5173" },
    })
    const foreignOrigin = await fetch(`http://127.0.0.1:${message.port}/rpc/health`, {
      method: "OPTIONS",
      headers: {
        origin: "https://example.com",
        "access-control-request-method": "GET",
        "access-control-request-headers": "authorization",
      },
    })

    expect(preflight.status).toBe(204)
    expect(preflight.headers.get("access-control-allow-origin")).toBe("http://localhost:5173")
    expect(filePreflight.status).toBe(204)
    expect(filePreflight.headers.get("access-control-allow-origin")).toBe("null")
    expect(unauthorized.status).toBe(401)
    expect(authorized.status).toBe(200)
    expect(authorized.headers.get("access-control-allow-origin")).toBe("http://localhost:5173")
    expect(foreignOrigin.status).toBe(403)
    expect(foreignOrigin.headers.get("access-control-allow-origin")).toBeNull()
    expect(existsSync(databasePath)).toBe(true)

    child.kill("SIGTERM")
    const exitCode = await child.exited

    expect(exitCode).toBe(0)
    expect(() => process.kill(child.pid, 0)).toThrow()
  })
})
