import { describe, expect, test } from "bun:test"
import { mkdir, symlink, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { createObservationSystem } from "@src/engine/observability/observability"
import { createPiAgentRuntime, deferPiSessionFactory, type PiRuntimeEvent, type PiSessionFactory } from "@src/engine/pi/pi-agent-runtime"
import { authorizeToolCall, describeToolCall, pathIsInside } from "@src/engine/pi/pi-permissions"
import { testDirectory } from "../../support/test-directory"

const directory = testDirectory("jolt-pi-runtime-")

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
  test("keeps Bot sessions isolated", async () => {
    const { runtime, sessions, observations } = setup()
    await runtime.open({ botId: "atlas", cwd: directory, tools: ["read"], effort: "medium", model: null, permissionMode: "ask" })
    await runtime.open({ botId: "beacon", cwd: directory, tools: ["weather"], effort: "medium", model: null, permissionMode: "full" })
    const events: PiRuntimeEvent[] = []
    runtime.subscribe("atlas", (event) => events.push(event))

    await runtime.prompt("atlas", { content: "work", images: [] })
    await runtime.abort("beacon")

    expect(events).toEqual([{ type: "started" }, { type: "text", text: "done" }, { type: "finished", reason: "stop" }])
    expect(sessions.get("atlas")?.tools).toEqual(["read"])
    expect(sessions.get("beacon")?.tools).toEqual(["weather"])
    expect(sessions.get("beacon")?.aborted).toBe(true)

    runtime.dispose()
    await observations.observability.flush()
  })

  test("reopens a saved session file", async () => {
    const { runtime, observations } = setup()
    const first = await runtime.open({ botId: "atlas", cwd: directory, tools: [], effort: "medium", model: null, permissionMode: "ask" })
    const reopened = await runtime.open({ botId: "atlas", cwd: directory, tools: [], effort: "medium", model: null, permissionMode: "ask", sessionFile: first.sessionFile })

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

  test("applies the three permission modes to reads and actions", async () => {
    const root = join(directory, "authorized")
    await mkdir(root)
    await writeFile(join(root, "inside.txt"), "inside")
    const requests: string[] = []
    const ask = { botId: "atlas", allowedRoot: root, mode: "ask" as const, request: async ({ tool }: { tool: string }) => {
      requests.push(tool)

      return "allowed" as const
    } }

    expect(await authorizeToolCall({ botId: "atlas", allowedRoot: root, mode: "read-only" }, "write", { path: "inside.txt" }, "write-1")).toEqual({ allowed: false, reason: "missing_permission" })
    expect(await authorizeToolCall({ botId: "atlas", allowedRoot: root, mode: "read-only" }, "read", { path: "../outside.txt" }, "read-1")).toEqual({ allowed: false, reason: "path_outside_root" })
    expect(await authorizeToolCall(ask, "read", { path: "inside.txt" }, "read-2")).toEqual({ allowed: true })
    expect(await authorizeToolCall(ask, "read", { path: "../outside.txt" }, "read-3")).toEqual({ allowed: true })
    expect(await authorizeToolCall(ask, "note", { content: "Prefere PDF" }, "note-1")).toEqual({ allowed: true })
    expect(await authorizeToolCall({ ...ask, request: async () => "denied" }, "bash", { command: "bun test" }, "bash-1")).toEqual({ allowed: false, reason: "person_denied" })
    expect(await authorizeToolCall({ botId: "atlas", allowedRoot: root, mode: "full" }, "remember", { content: "Prefere PDF" }, "remember-1")).toEqual({ allowed: true })
    expect(requests).toEqual(["read", "note"])
  })

  test("holds an Ask tool call until the person decides or aborts the turn", async () => {
    let policy: Parameters<PiSessionFactory["open"]>[0]["policy"] | undefined
    const events: PiRuntimeEvent[] = []
    const observations = createObservationSystem({ appSessionId: crypto.randomUUID(), logDirectory: join(directory, "approval-logs"), development: false })
    const runtime = createPiAgentRuntime({
      async open(input) {
        policy = input.policy

        return { prompt: async () => undefined, abort: async () => undefined, subscribe: () => () => undefined, dispose() {} }
      },
    }, observations.observability)
    await runtime.open({ botId: "atlas", cwd: directory, tools: ["note"], effort: "medium", model: null, permissionMode: "ask" })
    runtime.subscribe("atlas", (event) => events.push(event))

    const authorization = authorizeToolCall(policy!, "note", { content: "Prefere PDF" }, "note-1")
    await Bun.sleep(0)

    expect(events).toEqual([{ type: "permission-requested", request: { id: "note-1", tool: "note", detail: "Prefere PDF" } }])
    expect(() => runtime.resolvePermission({ botId: "beacon", requestId: "note-1", decision: "allowed" })).toThrow("Permission request not found")
    runtime.resolvePermission({ botId: "atlas", requestId: "note-1", decision: "allowed" })
    expect(await authorization).toEqual({ allowed: true })
    expect(events.at(-1)).toEqual({ type: "permission-resolved", requestId: "note-1" })

    const interrupted = authorizeToolCall(policy!, "bash", { command: "bun test" }, "bash-1")
    await Bun.sleep(0)
    await runtime.abort("atlas")

    expect(await interrupted).toEqual({ allowed: false, reason: "person_denied" })
    expect(runtime.pending("atlas")).toEqual([])

    runtime.dispose()
    await observations.observability.flush()
  })

  test("shows the complete command before the person decides", () => {
    const command = `printf '%s' '${"a".repeat(180)}'; rm -rf /tmp/example`

    expect(describeToolCall("bash-1", "bash", { command })).toEqual({ id: "bash-1", tool: "bash", detail: command })
  })
})

describe("deferred session factory", () => {
  test("loads the real factory once, on the first open", async () => {
    let loads = 0
    const opened: string[] = []
    const factory = deferPiSessionFactory(async () => {
      loads += 1

      return { async open(input) {
        opened.push(input.botId)

        return { prompt: async () => undefined, abort: async () => undefined, subscribe: () => () => undefined, dispose() {} }
      } }
    })
    const input = { cwd: directory, tools: [], effort: "medium" as const, model: null, policy: { botId: "a", allowedRoot: directory, mode: "full" as const } }

    expect(loads).toBe(0)
    await Promise.all([factory.open({ ...input, botId: "a" }), factory.open({ ...input, botId: "b" })])
    await factory.open({ ...input, botId: "c" })
    expect(loads).toBe(1)
    expect(opened).toEqual(["a", "b", "c"])
  })

  test("warms the deferred factory once before the first open", async () => {
    let loads = 0
    const factory = deferPiSessionFactory(async () => {
      loads += 1

      return { async open() {
        return { prompt: async () => undefined, abort: async () => undefined, subscribe: () => () => undefined, dispose() {} }
      } }
    })

    await factory.warm()
    await factory.open({ botId: "a", cwd: directory, tools: [], effort: "medium", model: null, policy: { botId: "a", allowedRoot: directory, mode: "full" } })

    expect(loads).toBe(1)
  })
})
