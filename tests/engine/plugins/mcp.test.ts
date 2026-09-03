import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import { createObservationSystem } from "@src/engine/observability/observability"
import { createMcpAdapter } from "@src/engine/plugins/mcp/mcp"
import { testDirectory } from "../../support/test-directory"

const directory = testDirectory("jolt-mcp-")
const command = `${process.execPath} ${join(import.meta.dir, "../../support/mcp-echo-server.ts")}`

describe("mcp adapter", () => {
  test("connect lists namespaced tools and execute calls the server with the configured env", async () => {
    const system = createObservationSystem({ appSessionId: crypto.randomUUID(), logDirectory: join(directory, "logs"), development: false })
    const adapter = createMcpAdapter({ observability: system.observability })
    const config = { command, envNames: ["ECHO_TOKEN"] }
    const secret = JSON.stringify({ ECHO_TOKEN: "t0k" })
    const connected = await adapter.connect({ pluginId: "p1", name: "Echo Server", config, secret, step() {} }).connected

    expect(connected.label).toBe("Echo Server")
    expect(connected.tools.map((tool) => [tool.name, tool.label])).toEqual([["echo_server_say_hello", "say hello"], ["echo_server_fail", "fail"]])

    const account = { id: "a1", pluginId: "p1", label: "Echo Server", config, secret, saveSecret() {} }
    const hello = connected.tools[0]
    const fail = connected.tools[1]

    if (!hello || !fail) {
      throw new Error("Tools missing")
    }

    expect(await adapter.execute(account, hello, { name: "Ana" })).toBe("hello Ana from t0k")
    await expect(adapter.execute(account, fail, {})).rejects.toThrow("boom")
    await adapter.stop(account.id)
    await system.observability.flush()
  })

  test("a command that cannot start fails the connection", async () => {
    const system = createObservationSystem({ appSessionId: crypto.randomUUID(), logDirectory: join(directory, "logs"), development: false })
    const adapter = createMcpAdapter({ observability: system.observability })

    await expect(adapter.connect({ pluginId: "p2", name: "Broken", config: { command: join(directory, "missing-binary"), envNames: [] }, step() {} }).connected).rejects.toThrow()
    await system.observability.flush()
  })
})
