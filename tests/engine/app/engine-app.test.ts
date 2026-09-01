import { createORPCClient } from "@orpc/client"
import { RPCLink } from "@orpc/client/fetch"
import type { ContractRouterClient } from "@orpc/contract"
import { RPCHandler } from "@orpc/server/fetch"
import { describe, expect, test } from "bun:test"
import { mkdirSync, rmSync } from "node:fs"
import { join } from "node:path"
import { createEngineRouter } from "@src/engine/app/engine-app"
import { createBots } from "@src/engine/bots/bots"
import { createConversations } from "@src/engine/conversations/conversations"
import { createDiagnostics } from "@src/engine/observability/diagnostics"
import { createObservationSystem } from "@src/engine/observability/observability"
import { openDatabase } from "@src/engine/persistence/database"
import { createPiAgentRuntime, type PiSessionFactory } from "@src/engine/pi/pi-agent-runtime"
import { createPiProvider } from "@src/engine/pi/pi-provider"
import { createProjects } from "@src/engine/projects/projects"
import { createTasks } from "@src/engine/tasks/tasks"
import { engineContract } from "@src/shared/engine-contract"
import { testDirectory } from "../../support/test-directory"

const directory = testDirectory("jolt-engine-app-")
const botFunction = { outcome: "Answer", description: "Help" }

function setup() {
  const system = createObservationSystem({ appSessionId: crypto.randomUUID(), logDirectory: join(directory, "logs"), development: false })
  const database = openDatabase(join(directory, `${crypto.randomUUID()}.sqlite`), system.observability)
  const providers = createPiProvider(system.observability, async () => [{ id: "gpt-5.6-luna" }])
  const bots = createBots({ database, observability: system.observability, privateBotsDirectory: join(directory, "bots"), providers })
  const projects = createProjects({ database, observability: system.observability, bots })
  const tasks = createTasks({ database, observability: system.observability })
  const sessionFactory: PiSessionFactory = {
    async open() {
      throw new Error("The session must not open")
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
  const client: ContractRouterClient<typeof engineContract> = createORPCClient(new RPCLink({ url: `http://127.0.0.1:${server.port}/rpc` }))

  async function close() {
    await server.stop(true)
    conversations.dispose()
    database.close()
    await system.observability.flush()
  }

  return { bots, client, close, projects }
}

describe("engine router", () => {
  test("a domain error reaches the Renderer with its own message", async () => {
    const environment = setup()

    expect(environment.client.bots.get({ id: "missing" })).rejects.toThrow("Bot not found")
    await environment.close()
  })

  test("a failure before the Bot replies reaches the Renderer with its own message", async () => {
    const environment = setup()
    const workingDirectory = join(directory, "project")
    mkdirSync(workingDirectory)
    const project = await environment.projects.create({ name: "Jolt", defaultWorkingDirectory: workingDirectory })
    const bot = await environment.bots.create({ name: "Marina", provider: "codex", function: botFunction, projectId: project.id })
    rmSync(workingDirectory, { recursive: true })

    expect(environment.client.conversations.send({ botId: bot.id, content: "oi" })).rejects.toThrow("Working directory is not accessible")
    await environment.close()
  })
})
