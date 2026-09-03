import { RPCHandler } from "@orpc/server/fetch"
import { QueryClient } from "@tanstack/react-query"
import { expect, test } from "bun:test"
import { join } from "node:path"
import { createEngineRouter } from "@src/engine/app/engine-app"
import { createBots } from "@src/engine/bots/bots"
import { createConversations } from "@src/engine/conversations/conversations"
import { createMemory } from "@src/engine/memory/memory"
import { createPlugins } from "@src/engine/plugins/plugins"
import { createSecrets } from "@src/engine/plugins/secrets"
import { createDiagnostics } from "@src/engine/observability/diagnostics"
import { createObservationSystem } from "@src/engine/observability/observability"
import { openDatabase } from "@src/engine/persistence/database"
import { createPiAgentRuntime, type PiRuntimeEvent, type PiSessionFactory } from "@src/engine/pi/pi-agent-runtime"
import { authorizeToolCall } from "@src/engine/pi/pi-permissions"
import { createPiProvider } from "@src/engine/pi/pi-provider"
import { createProjects } from "@src/engine/projects/projects"
import { createRoutines } from "@src/engine/routines/routines"
import { createTasks } from "@src/engine/tasks/tasks"
import { subscribeChatEvents } from "@src/renderer/src/chat/chat-events"
import { chatStore } from "@src/renderer/src/chat/chat-store"
import { createEngineClient } from "@src/renderer/src/engine-client"
import { fakePluginAdapter } from "../../support/fake-plugin-adapter"
import { testDirectory } from "../../support/test-directory"

const directory = testDirectory("jolt-chat-events-")

function setup() {
  const system = createObservationSystem({ appSessionId: crypto.randomUUID(), logDirectory: join(directory, "logs"), development: false })
  const database = openDatabase(join(directory, `${crypto.randomUUID()}.sqlite`), system.observability)
  const providers = createPiProvider(system.observability, async () => [{ id: "gpt-5.6-luna", name: "GPT-5.6 Luna" }])
  const bots = createBots({ database, observability: system.observability, privateBotsDirectory: join(directory, "bots"), providers, conversations: { close: (botId) => conversations.close(botId) } })
  const projects = createProjects({ database, observability: system.observability, bots })
  const tasks = createTasks({ database, observability: system.observability })
  const sessionFactory: PiSessionFactory = {
    async open(input) {
      const listeners = new Set<(event: PiRuntimeEvent) => void>()

      return {
        compact: async () => ({ tokensBefore: 0 }),
        async prompt() {
          for (const listener of listeners) {
            listener({ type: "started" })
          }

          const authorization = await authorizeToolCall(input.policy, "note", { content: "Prefere PDF" }, "note-1")

          for (const listener of listeners) {
            listener({ type: "text", text: authorization.allowed ? "Resposta pronta" : "Pedido negado" })
            listener({ type: "finished", reason: "stop" })
          }
        },
        async abort() {},
        subscribe(listener) {
          listeners.add(listener)

          return () => listeners.delete(listener)
        },
        dispose() {},
      }
    },
  }
  const runtime = createPiAgentRuntime(sessionFactory, system.observability)
  const conversations = createConversations({ database, bots, tasks, runtime, observability: system.observability, extensions: [{ tools: (bot) => routines.tools(bot), instructions: (bot) => routines.instructions(bot) }, { tools: (bot) => memory.tools(bot), instructions: (bot) => memory.instructions(bot) }] })
  const routines = createRoutines({ database, bots, observability: system.observability, conversations: { call: (routine) => conversations.call(routine) } })
  const memory = createMemory({ database, bots, observability: system.observability, sessionFactory, conversations: { active: (botId) => conversations.active(botId), events: () => conversations.events() } })
  const plugins = createPlugins({
    database,
    bots,
    observability: system.observability,
    secrets: createSecrets("00".repeat(32)),
    adapters: { gmail: fakePluginAdapter("gmail").adapter, whatsapp: fakePluginAdapter("whatsapp").adapter, mcp: fakePluginAdapter("mcp").adapter },
    conversations: { notify: (botId, event) => conversations.notify(botId, event), addTools: (botId, tools) => conversations.addTools(botId, tools) },
  })
  const diagnostics = createDiagnostics({
    source: system.diagnostics,
    versions: { app: "0.0.0", bun: Bun.version, electron: "test" },
    processState: () => ({ engine: "ready", main: "ready" }),
    migrationState: database.migrationState,
    exportDirectory: join(directory, "diagnostics"),
  })
  const handler = new RPCHandler(createEngineRouter(new Date().toISOString(), system.observability, diagnostics, system.receiver, providers, bots, projects, conversations, tasks, routines, memory, { decide: (decision) => runtime.resolvePermission(decision) }, plugins))
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      const result = await handler.handle(request, { prefix: "/rpc" })

      return result.matched ? result.response : new Response("Not found", { status: 404 })
    },
  })
  const client = createEngineClient({ url: `http://127.0.0.1:${server.port}/rpc`, token: "test" })

  async function close() {
    await server.stop(true)
    memory.dispose()
    routines.dispose()
    conversations.dispose()
    database.close()
    await system.observability.flush()
  }

  return { bots, client, close }
}

async function until(condition: () => boolean) {
  for (let attempt = 0; attempt < 200 && !condition(); attempt++) {
    await new Promise<void>((resolve) => setTimeout(resolve, 10))
  }

  expect(condition()).toBe(true)
}

test("a turn streamed by the Engine drives the chat store from start to completion", async () => {
  const environment = setup()
  const queryClient = new QueryClient()
  const stop = subscribeChatEvents({ client: environment.client, queryClient })
  const bot = await environment.bots.create({ name: "Marina", provider: "codex", function: { outcome: "Answer", description: "Help" } })
  const seen: string[] = []
  const subscription = chatStore.subscribe(() => {
    const response = chatStore.state.runs[bot.id]?.responseContent

    if (response) {
      seen.push(response)
    }
  })

  await environment.client.raw.conversations.send({ botId: bot.id, content: "Olá", images: [] })
  await until(() => chatStore.state.statuses[bot.id] === "awaiting-decision")

  expect(chatStore.state.runs[bot.id]?.permissionRequests).toEqual([{ id: "note-1", tool: "note", detail: "Prefere PDF" }])
  await environment.client.raw.permissions.decide({ botId: bot.id, requestId: "note-1", decision: "allowed" })
  await until(() => chatStore.state.statuses[bot.id] === "completed")

  expect(seen).toContain("Resposta pronta")
  expect(chatStore.state.runs[bot.id]).toBeUndefined()
  subscription.unsubscribe()
  stop()
  await environment.close()
})
