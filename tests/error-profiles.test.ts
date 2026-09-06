import { expect, mock, test } from "bun:test"
import { mkdir, symlink } from "node:fs/promises"
import { join } from "node:path"
import type { ExtensionAPI, ToolCallEvent, ToolCallEventResult } from "@earendil-works/pi-coding-agent"
import { createBots } from "@src/engine/bots/bots"
import { createDelegation } from "@src/engine/conversations/delegation"
import { createObservationSystem } from "@src/engine/observability/observability"
import { openDatabase, type AppDatabase } from "@src/engine/persistence/database"
import { createPermissionExtension, type PiPermissionPolicy } from "@src/engine/pi/pi-permissions"
import { createTasks } from "@src/engine/tasks/tasks"
import { toolsForExecutionProfile } from "@src/shared/bot-profiles"
import { testDirectory } from "./support/test-directory"

const directory = testDirectory("jolt-error-profiles-")

async function withBots(check: (input: { bots: ReturnType<typeof createBots>; database: AppDatabase; tasks: ReturnType<typeof createTasks>; observability: ReturnType<typeof createObservationSystem>["observability"]; workspace: string; validateExecution: ReturnType<typeof mock<Parameters<typeof createBots>[0]["providers"]["validateExecution"]>> }) => Promise<void>) {
  const { observability } = createObservationSystem({ appSessionId: "test-profiles", logDirectory: join(directory, "logs"), development: false, outputs: [] })
  const database = openDatabase(join(directory, "jolt.sqlite"), observability)
  const workspace = join(directory, "error-automation", "workspaces", "analysis")
  await mkdir(workspace, { recursive: true })
  const validateExecution = mock<Parameters<typeof createBots>[0]["providers"]["validateExecution"]>(async () => {})
  const bots = createBots({ database, observability, privateBotsDirectory: join(directory, "bots"), providers: { async list() { return [{ provider: "codex", name: "Codex", status: "available", connection: "subscription", connected: true, detectedKey: false }] }, validateExecution }, conversations: { async close() {}, isActive() { return false } } })

  try {
    await check({ bots, database, tasks: createTasks({ database, observability }), observability, workspace, validateExecution })
  } finally {
    database.close()
    await observability.flush()
  }
}

async function permissionCalls(policy: PiPermissionPolicy) {
  type Handler = (event: ToolCallEvent) => ToolCallEventResult | void | Promise<ToolCallEventResult | void>
  const handlers = new Map<string, Handler>()
  // The SDK surface is large; this extension only registers event callbacks.
  const api = new Proxy({} as ExtensionAPI, {
    get(_target, name) {
      if (name === "on") {
        return (event: string, handler: Handler) => handlers.set(event, handler)
      }

      throw new Error(`Unexpected SDK operation ${String(name)}`)
    },
  })
  const extension = createPermissionExtension(policy)
  const factory = typeof extension === "function" ? extension : extension.factory
  await factory(api)

  return async (toolName: string, input: Record<string, unknown>) => {
    const handler = handlers.get("tool_call")

    if (!handler) {
      throw new Error("Permission extension did not register tool_call")
    }

    return await handler({ type: "tool_call", toolName, toolCallId: crypto.randomUUID(), input })
  }
}

test("hiring persists ordinary defaults or the managed Luna profile before the first task executes", async () => {
  await withBots(async ({ bots, database, tasks, observability, workspace, validateExecution }) => {
    const leader = await bots.create({ name: "Leader" })
    const observed: unknown[] = []
    const delegation = createDelegation({ bots, tasks, observability, active() { return undefined }, assertCallable() {}, inheritance() { return [] }, async runTurn(botId) {
      const worker = database.bots.get(botId)!
      const task = database.tasks.listForBot(botId)[0]!
      observed.push({ model: worker.model, effort: worker.effort, permissionMode: worker.permissionMode, memoryEnabled: worker.memoryEnabled, executionProfile: worker.executionProfile, directory: worker.workingDirectoryOverride, taskStatus: task.status })

      return { finished: Promise.resolve({ reason: "stop" as const, response: "" }) }
    } })
    const hire = delegation.tools(leader).find((tool) => tool.name === "hire")!
    await hire.execute({ name: "General", role: "Help", outcome: "Read the task", wait: "yes", permanent: "no" })
    await hire.execute({ name: "Analyst", role: "Analyze", outcome: "Find the cause", wait: "yes", permanent: "no", profile: "error-analyst", directory: workspace })
    expect(observed).toEqual([
      { model: null, effort: "medium", permissionMode: "ask", memoryEnabled: true, executionProfile: null, directory: null, taskStatus: "working" },
      { model: "gpt-5.6-luna", effort: "max", permissionMode: "read-only", memoryEnabled: false, executionProfile: "error-analyst", directory: workspace, taskStatus: "working" },
    ])
    expect(validateExecution).toHaveBeenCalledWith("codex", "gpt-5.6-luna", "max")
  })
})

test("managed profiles reject direct member hiring, outside workspaces and ordinary settings updates", async () => {
  await withBots(async ({ bots, database, workspace }) => {
    const leader = await bots.create({ name: "Leader" })
    const details = { name: "Analyst", function: { outcome: "Analyze" }, permanent: true, executionProfile: "error-analyst", workingDirectoryOverride: workspace }
    const analyst = await bots.hire(leader, details)
    await expect(bots.hire(analyst, { name: "Nested", function: { outcome: "Analyze" }, permanent: true })).rejects.toThrow("member cannot lead")
    await expect(bots.hire(leader, { ...details, workingDirectoryOverride: directory })).rejects.toThrow("managed mirror or correction worktree")
    await expect(bots.update({ id: analyst.id, name: "Changed", function: analyst.function, projectId: null, workingDirectoryOverride: workspace, memoryEnabled: true, effort: "low", model: null, permissionMode: "full" })).rejects.toThrow("managed error Bots")
    expect(() => bots.updateExecution({ id: analyst.id, setting: "permissionMode", value: "full" })).toThrow("managed error Bots")
    expect(database.bots.list()).toHaveLength(2)
    expect(database.bots.get(analyst.id)).toMatchObject({ name: "Analyst", memoryEnabled: false, effort: "max", model: "gpt-5.6-luna", permissionMode: "read-only" })
  })
})

test("an unsupported managed model is rejected before a worker or task is persisted", async () => {
  await withBots(async ({ bots, database, workspace, validateExecution }) => {
    const leader = await bots.create({ name: "Leader" })
    validateExecution.mockRejectedValue(new Error("Model does not support effort max"))
    await expect(bots.hire(leader, { name: "Analyst", function: { outcome: "Analyze" }, permanent: false, executionProfile: "error-analyst", workingDirectoryOverride: workspace })).rejects.toThrow("does not support effort max")
    expect(database.bots.list().map((bot) => bot.id)).toEqual([leader.id])
    expect(database.tasks.listForBot(leader.id)).toEqual([])
  })
})

test("managed allowlists override full permission: analyst cannot mutate and fixer only receives automation_bash", async () => {
  await mkdir(join(directory, "workspace"), { recursive: true })
  const root = join(directory, "workspace")
  await Bun.write(join(root, "code.ts"), "export const value = 1")
  await Bun.write(join(root, ".env"), "TOKEN=test-value")
  const tools = ["read", "write", "edit", "bash", "automation_bash", "github_issue_create", "hire"]

  for (const { profile, canWrite } of [{ profile: "error-analyst", canWrite: false }, { profile: "error-fixer", canWrite: true }] as const) {
    const call = await permissionCalls({ botId: profile, mode: "full", allowedRoot: root, allowedTools: toolsForExecutionProfile(profile, tools) })
    expect(await call("read", { path: "code.ts" })).toBeUndefined()
    expect(await call("read", { path: ".env" })).toMatchObject({ block: true })
    expect(await call("bash", { command: "pwd" })).toMatchObject({ block: true })
    expect(await call("github_issue_create", { title: "Unauthorized" })).toMatchObject({ block: true })
    expect(await call("hire", { name: "Nested" })).toMatchObject({ block: true })

    if (canWrite) {
      expect(await call("write", { path: "new.ts", content: "new code" })).toBeUndefined()
      expect(await call("automation_bash", { command: "bun test" })).toBeUndefined()
    } else {
      expect(await call("write", { path: "new.ts", content: "new code" })).toMatchObject({ block: true })
      expect(await call("automation_bash", { command: "bun test" })).toMatchObject({ block: true })
    }
  }
})

test("fixer writes cannot escape through parent paths or dangling symlinks", async () => {
  const root = join(directory, "workspace")
  await mkdir(root, { recursive: true })
  await Bun.write(join(directory, "outside.ts"), "outside")
  await symlink(join(directory, "outside.ts"), join(root, "outside-link.ts"))
  await symlink(join(directory, "not-created.ts"), join(root, "dangling.ts"))
  const call = await permissionCalls({ botId: "fixer", mode: "full", allowedRoot: root, allowedTools: ["read", "edit", "write"] })
  expect(await call("write", { path: "new.ts", content: "inside" })).toBeUndefined()

  for (const path of ["../outside.ts", "outside-link.ts", "dangling.ts"]) {
    expect(await call("write", { path, content: "escape" })).toMatchObject({ block: true })
  }
})
