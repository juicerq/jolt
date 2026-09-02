import { describe, expect, test } from "bun:test"
import { mkdir, symlink, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { createObservationSystem } from "@src/engine/observability/observability"
import { createPiAgentRuntime, deferPiSessionFactory, type PiRuntimeEvent, type PiSessionFactory } from "@src/engine/pi/pi-agent-runtime"
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"
import { authorizeToolCall, createPermissionExtension, describeToolCall, pathIsInside } from "@src/engine/pi/pi-permissions"
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
    expect(await authorizeToolCall(ask, "read", { path: "../outside.txt" }, "read-3")).toEqual({ allowed: true, asked: true })
    expect(await authorizeToolCall(ask, "note", { content: "Prefere PDF" }, "note-1")).toEqual({ allowed: true, asked: true })
    expect(await authorizeToolCall(ask, "connect_plugin", { plugin: "gmail" }, "connect-1")).toEqual({ allowed: true })
    expect(await authorizeToolCall({ botId: "atlas", allowedRoot: root, mode: "read-only" }, "connect_plugin", { plugin: "gmail" }, "connect-2")).toEqual({ allowed: false, reason: "missing_permission" })
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
    expect(await authorization).toEqual({ allowed: true, asked: true })
    expect(events.at(-1)).toEqual({ type: "permission-resolved", requestId: "note-1" })

    const interrupted = authorizeToolCall(policy!, "bash", { command: "bun test" }, "bash-1")
    await Bun.sleep(0)
    await runtime.abort("atlas")

    expect(await interrupted).toEqual({ allowed: false, reason: "person_denied" })
    expect(runtime.pending("atlas")).toEqual([])

    runtime.dispose()
    await observations.observability.flush()
  })

  test("tells the Bot that a denial is a decision and that an allowed action was seen by the person", async () => {
    const handlers = new Map<string, (event: unknown) => Promise<unknown>>()
    const api = { on: (event: string, handler: (event: unknown) => Promise<unknown>) => handlers.set(event, handler) } as unknown as ExtensionAPI
    const decisions: Record<string, "allowed" | "denied"> = { "bash-1": "denied", "bash-2": "allowed" }
    const extension = createPermissionExtension({ botId: "atlas", allowedRoot: directory, mode: "ask", request: async ({ id }) => decisions[id] ?? "denied" })

    if (typeof extension === "function") {
      throw new Error("Expected a named extension")
    }

    await extension.factory(api)
    const toolCall = handlers.get("tool_call")
    const toolResult = handlers.get("tool_result")

    const blocked = await toolCall?.({ type: "tool_call", toolCallId: "bash-1", toolName: "bash", input: { command: "rm -rf dist" } })

    expect(blocked).toMatchObject({ block: true })
    expect(String((blocked as { reason: string }).reason)).toContain("The person denied this action")
    expect(String((blocked as { reason: string }).reason)).toContain("Do not retry it")
    expect(await toolCall?.({ type: "tool_call", toolCallId: "bash-2", toolName: "bash", input: { command: "ls" } })).toBeUndefined()
    expect(await toolResult?.({ type: "tool_result", toolCallId: "bash-2", toolName: "bash", input: { command: "ls" }, content: [{ type: "text", text: "dist\n" }], isError: false })).toEqual({
      content: [{ type: "text", text: "The person allowed this action.\n\ndist\n" }],
    })
    expect(await toolResult?.({ type: "tool_result", toolCallId: "read-9", toolName: "read", input: { path: "a" }, content: [{ type: "text", text: "a" }], isError: false })).toBeUndefined()
  })

  test("shows the complete command and the folder it runs in before the person decides", () => {
    const command = `printf '%s' '${"a".repeat(180)}'; rm -rf /tmp/example`

    expect(describeToolCall("bash-1", "bash", { command }, undefined, "/home/ana/projeto")).toEqual({ id: "bash-1", tool: "bash", detail: command, cwd: "/home/ana/projeto" })
  })

  test("marks the tool call the person denied when it finishes", async () => {
    const { runtime, sessions, observations } = setup()
    let policy: Parameters<PiSessionFactory["open"]>[0]["policy"] | undefined
    const events: PiRuntimeEvent[] = []
    const runtimeWithPolicy = createPiAgentRuntime({
      async open(input) {
        policy = input.policy

        return {
          prompt: async () => undefined,
          abort: async () => undefined,
          subscribe(listener) {
            sessions.set("atlas", { listeners: new Set([listener]), aborted: false, disposed: false, tools: input.tools })
            return () => undefined
          },
          dispose() {},
        }
      },
    }, observations.observability)
    await runtimeWithPolicy.open({ botId: "atlas", cwd: directory, tools: ["bash"], effort: "medium", model: null, permissionMode: "ask" })
    runtimeWithPolicy.subscribe("atlas", (event) => events.push(event))
    const emit = (event: PiRuntimeEvent) => {
      for (const listener of sessions.get("atlas")?.listeners ?? []) {
        listener(event)
      }
    }

    emit({ type: "tool-started", callId: "bash-1", tool: "bash", detail: "rm -rf dist" })
    const authorization = authorizeToolCall(policy!, "bash", { command: "rm -rf dist" }, "bash-1")
    await Bun.sleep(0)
    runtimeWithPolicy.resolvePermission({ botId: "atlas", requestId: "bash-1", decision: "denied" })
    expect(await authorization).toEqual({ allowed: false, reason: "person_denied" })
    emit({ type: "tool-finished", callId: "bash-1", tool: "bash", failed: true, error: "The person denied this tool call" })
    emit({ type: "tool-started", callId: "bash-2", tool: "bash", detail: "bun test" })
    emit({ type: "tool-finished", callId: "bash-2", tool: "bash", failed: true, error: "exit 1" })

    expect(events.filter((event) => event.type === "tool-finished")).toEqual([
      { type: "tool-finished", callId: "bash-1", tool: "bash", failed: true, denied: true, error: "The person denied this tool call" },
      { type: "tool-finished", callId: "bash-2", tool: "bash", failed: true, error: "exit 1" },
    ])

    runtime.dispose()
    runtimeWithPolicy.dispose()
    await observations.observability.flush()
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
