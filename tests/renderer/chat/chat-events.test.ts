import { RPCHandler } from "@orpc/server/fetch"
import { QueryClient } from "@tanstack/react-query"
import { expect, test } from "bun:test"
import { join } from "node:path"
import { createEngineRouter } from "@src/engine/app/engine-app"
import { createBots } from "@src/engine/bots/bots"
import { createConversations } from "@src/engine/conversations/conversations"
import { createDiagnostics } from "@src/engine/observability/diagnostics"
import { createObservationSystem } from "@src/engine/observability/observability"
import { openDatabase } from "@src/engine/persistence/database"
import { createPiAgentRuntime, type PiRuntimeEvent, type PiSessionFactory } from "@src/engine/pi/pi-agent-runtime"
import { createPiProvider } from "@src/engine/pi/pi-provider"
import { createProjects } from "@src/engine/projects/projects"
import { createTasks } from "@src/engine/tasks/tasks"
import { subscribeChatEvents } from "@src/renderer/src/chat/chat-events"
import { chatStore } from "@src/renderer/src/chat/chat-store"
import { createEngineClient } from "@src/renderer/src/engine-client"
import { testDirectory } from "../../support/test-directory"

const directory = testDirectory("jolt-chat-events-")

function setup() {
  const system = createObservationSystem({ appSessionId: crypto.randomUUID(), logDirectory: join(directory, "logs"), development: false })
  const database = openDatabase(join(directory, `${crypto.randomUUID()}.sqlite`), system.observability)
  const providers = createPiProvider(system.observability, async () => [{ id: "gpt-5.6-luna" }])
  const bots = createBots({ database, observability: system.observability, privateBotsDirectory: join(directory, "bots"), providers, conversations: { close: (botId) => conversations.close(botId) } })
  const projects = createProjects({ database, observability: system.observability, bots })
  const tasks = createTasks({ database, observability: system.observability })
  const sessionFactory: PiSessionFactory = {
    async open() {
      const listeners = new Set<(event: PiRuntimeEvent) => void>()

      return {
        async prompt() {
          for (const listener of listeners) {
            listener({ type: "started" })
            listener({ type: "text", text: "Resposta pronta" })
            listener({ type: "finished", reason: "stop" })
          }
        },
        async abort() {},
        setTools() {},
        subscribe(listener) {
          listeners.add(listener)

          return () => listeners.delete(listener)
        },
        dispose() {},
      }
    },
  }
  const runtime = createPiAgentRuntime(sessionFactory, system.observability)
  const conversations = createConversations({ database, bots, tasks, runtime, observability: system.observability })
  const diagnostics = createDiagnostics({
    source: system.diagnostics,
    versions: { app: "0.0.0", bun: Bun.version, electron: "test" },
    processState: () => ({ engine: "ready", main: "ready" }),
    migrationState: database.migrationState,
    exportDirectory: join(directory, "diagnostics"),
  })
  const handler = new RPCHandler(createEngineRouter(new Date().toISOString(), system.observability, diagnostics, system.receiver, providers, bots, projects, conversations, tasks))
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

  await environment.client.raw.conversations.send({ botId: bot.id, content: "Olá" })
  await until(() => chatStore.state.statuses[bot.id] === "completed")

  expect(seen).toContain("Resposta pronta")
  expect(chatStore.state.runs[bot.id]).toBeUndefined()
  subscription.unsubscribe()
  stop()
  await environment.close()
})
