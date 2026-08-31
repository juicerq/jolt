import { describe, expect, test } from "bun:test"
import { mkdir, symlink, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { createObservationSystem } from "@src/engine/observability/observability"
import { createPiAgentRuntime, type PiRuntimeEvent, type PiSessionFactory } from "@src/engine/pi/pi-agent-runtime"
import { authorizeToolCall, pathIsInside } from "@src/engine/pi/pi-permissions"
import { testDirectory } from "../../support/test-directory"

const directory = testDirectory("jots-pi-runtime-")

function setup() {
  const sessions = new Map<string, { tools: string[]; listeners: Set<(event: PiRuntimeEvent) => void>; aborted: boolean; disposed: boolean }>()
  const factory: PiSessionFactory = {
    async open(input) {
      const state = { tools: [...input.tools], listeners: new Set<(event: PiRuntimeEvent) => void>(), aborted: false, disposed: false }
      sessions.set(input.botId, state)

      return {
        sessionFile: input.sessionFile ?? join(directory, `${input.botId}.jsonl`),
        async prompt() {
          for (const listener of state.listeners) {
            listener({ type: "started" })
            listener({ type: "text", text: "done" })
            listener({ type: "finished", reason: "stop" })
          }
        },
        async abort() {
          state.aborted = true
        },
        setTools(tools) {
          state.tools = [...tools]
        },
        subscribe(listener) {
          state.listeners.add(listener)
          return () => state.listeners.delete(listener)
        },
        dispose() {
          state.disposed = true
        },
      }
    },
  }
  const observations = createObservationSystem({ appSessionId: crypto.randomUUID(), logDirectory: join(directory, "logs"), development: false })

  return { runtime: createPiAgentRuntime(factory, observations.observability), sessions, observations }
}

describe("Pi agent runtime", () => {
  test("keeps Bot sessions isolated and changes tools without reopening", async () => {
    const { runtime, sessions, observations } = setup()
    const atlasGrants = new Set(["read"])
    const beaconGrants = new Set(["weather"])
    await runtime.open({ botId: "atlas", cwd: directory, tools: ["read"], grants: atlasGrants })
    await runtime.open({ botId: "beacon", cwd: directory, tools: ["weather"], grants: beaconGrants })
    const events: PiRuntimeEvent[] = []
    runtime.subscribe("atlas", (event) => events.push(event))

    await runtime.prompt("atlas", "work")
    runtime.setTools("atlas", ["read", "weather"])
    await runtime.abort("beacon")

    expect(events).toEqual([{ type: "started" }, { type: "text", text: "done" }, { type: "finished", reason: "stop" }])
    expect(sessions.get("atlas")?.tools).toEqual(["read", "weather"])
    expect(atlasGrants).toEqual(new Set(["read", "weather"]))
    expect(sessions.get("beacon")?.tools).toEqual(["weather"])
    expect(sessions.get("beacon")?.aborted).toBe(true)

    runtime.dispose()
    await observations.observability.flush()
  })

  test("reopens a saved session file", async () => {
    const { runtime, observations } = setup()
    const first = await runtime.open({ botId: "atlas", cwd: directory, tools: [], grants: new Set() })
    const reopened = await runtime.open({ botId: "atlas", cwd: directory, tools: [], grants: new Set(), sessionFile: first.sessionFile })

    expect(reopened.sessionFile).toBe(first.sessionFile)
    runtime.dispose()
    await observations.observability.flush()
  })

  test("blocks traversal and symlinks outside the allowed folder", async () => {
    const root = join(directory, "root")
    const outside = join(directory, "outside.txt")
    await mkdir(root)
    await writeFile(join(root, "inside.txt"), "inside")
    await writeFile(outside, "outside")
    await symlink(outside, join(root, "linked.txt"))

    expect(await pathIsInside(root, "inside.txt")).toBe(true)
    expect(await pathIsInside(root, "../outside.txt")).toBe(false)
    expect(await pathIsInside(root, "linked.txt")).toBe(false)
  })

  test("checks current tool and path permissions before execution", async () => {
    const root = join(directory, "authorized")
    await mkdir(root)
    await writeFile(join(root, "inside.txt"), "inside")
    const policy = { botId: "atlas", allowedRoot: root, grants: new Set(["read"]) }

    expect(await authorizeToolCall(policy, "write", { path: "inside.txt" })).toEqual({ allowed: false, reason: "missing_permission" })
    expect(await authorizeToolCall(policy, "read", { path: "../outside.txt" })).toEqual({ allowed: false, reason: "path_outside_root" })
    expect(await authorizeToolCall(policy, "read", { path: "inside.txt" })).toEqual({ allowed: true })
  })
})
