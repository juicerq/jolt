import { RPCHandler } from "@orpc/server/fetch"
import { registerBunOAuthFlows } from "@earendil-works/pi-ai/bun-oauth"
import { z } from "zod"
import { dirname, join } from "node:path"
import { forwardedObservation } from "../shared/engine-ipc"
import type { ProcessState } from "../shared/observability/diagnostics"
import { parse } from "../shared/parse"
import { createEngineRouter } from "./app/engine-app"
import { createDiagnostics } from "./observability/diagnostics"
import { createObservationSystem } from "./observability/observability"
import { openDatabase } from "./persistence/database"
import { createBots } from "./bots/bots"
import { createConversations } from "./conversations/conversations"
import { createMemory } from "./memory/memory"
import { createGmailAdapter } from "./plugins/gmail/gmail"
import { createMcpAdapter } from "./plugins/mcp/mcp"
import { createWhatsappAdapter } from "./plugins/whatsapp/whatsapp"
import { createPlugins } from "./plugins/plugins"
import { createSecrets } from "./plugins/secrets"
import { createPiAgentRuntime, deferPiSessionFactory } from "./pi/pi-agent-runtime"
import { createPiLoadSessionFactory } from "./pi/pi-load-session"
import { createPiModels } from "./pi/pi-models"
import { createPiProvider } from "./pi/pi-provider"
import { createProjects } from "./projects/projects"
import { createRoutines } from "./routines/routines"
import { createTasks } from "./tasks/tasks"

registerBunOAuthFlows()

const environmentSchema = z.object({
  BOT_TEAMS_ENGINE_TOKEN: z.string().min(1),
  BOT_TEAMS_DATABASE_PATH: z.string().min(1),
  BOT_TEAMS_PRIVATE_BOTS_DIRECTORY: z.string().min(1),
  BOT_TEAMS_DEVELOPMENT: z.enum(["true", "false"]).optional(),
  BOT_TEAMS_LOAD_PROVIDER: z.enum(["true", "false"]).optional(),
  BOT_TEAMS_APP_VERSION: z.string().min(1).optional(),
  BOT_TEAMS_ELECTRON_VERSION: z.string().min(1).optional(),
  BOT_TEAMS_SECRET_KEY: z.string().regex(/^[0-9a-f]{64}$/),
  BOT_TEAMS_GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  BOT_TEAMS_GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
})
const environment = parse(environmentSchema, process.env)
const startedAt = new Date().toISOString()
const observationSystem = createObservationSystem({
  appSessionId: crypto.randomUUID(),
  logDirectory: join(dirname(environment.BOT_TEAMS_DATABASE_PATH), "logs"),
  development: environment.BOT_TEAMS_DEVELOPMENT === "true",
})
let engineState: ProcessState = "starting"
let mainState: ProcessState = "unknown"
let mainShutdown: { timestamp: string; startedAt: number } | undefined

process.on("message", (message) => {
  try {
    const input = parse(forwardedObservation, message)

    if (input.type === "observation") {
      observationSystem.observability.event(input)

      if (input.name === "main.started") {
        mainState = "ready"
      }

      if (input.name === "main.stopped") {
        mainState = "stopping"
        mainShutdown = { timestamp: new Date().toISOString(), startedAt: performance.now() }
      }

      return
    }

    observationSystem.receiver.span(input.span)
  } catch {
    process.stderr.write("Rejected invalid Main observation\n")
  }
})

function allowedOrigin(request: Request) {
  const origin = request.headers.get("origin")

  if (!origin || origin === "null") {
    return origin
  }

  try {
    const url = new URL(origin)
    const loopback = url.hostname === "127.0.0.1" || url.hostname === "localhost"

    if (url.protocol !== "http:" || !loopback) {
      return
    }

    return origin
  } catch {
    return
  }
}

function withCors(response: Response, origin: string | null | undefined) {
  if (!origin) {
    return response
  }

  const headers = new Headers(response.headers)
  headers.set("access-control-allow-origin", origin)
  headers.set("vary", "Origin")

  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

const piWarmDelayMs = 1_000
const startupTimestamp = new Date().toISOString()
const startupStartedAt = performance.now()
const database = openDatabase(environment.BOT_TEAMS_DATABASE_PATH, observationSystem.observability)
const piModels = createPiModels()
const providers = createPiProvider(observationSystem.observability, piModels)
const bots = createBots({
  database,
  observability: observationSystem.observability,
  privateBotsDirectory: environment.BOT_TEAMS_PRIVATE_BOTS_DIRECTORY,
  providers,
  conversations: { close: (botId) => conversations.close(botId) },
})
const projects = createProjects({ database, observability: observationSystem.observability, bots })
const piDirectory = join(dirname(environment.BOT_TEAMS_DATABASE_PATH), "pi")
const loadProvider = environment.BOT_TEAMS_LOAD_PROVIDER === "true"
const deferredPiSessionFactory = deferPiSessionFactory(() =>
  observationSystem.observability.span({ name: "pi.sdkload" }, async () => {
    const { createPiSessionFactory } = await import("./pi/pi-session-adapter")

    return createPiSessionFactory({
      agentDirectory: join(piDirectory, "agent"),
      sessionsDirectory: join(piDirectory, "sessions"),
      models: piModels,
    })
  }))
const piSessionFactory = loadProvider ? createPiLoadSessionFactory() : deferredPiSessionFactory
const piRuntime = createPiAgentRuntime(piSessionFactory, observationSystem.observability)
const tasks = createTasks({ database, observability: observationSystem.observability })
const conversations = createConversations({
  database,
  bots,
  tasks,
  runtime: piRuntime,
  observability: observationSystem.observability,
  extensions: [
    { tools: (bot) => routines.tools(bot), instructions: (bot) => routines.instructions(bot) },
    { tools: (bot) => memory.tools(bot), instructions: (bot) => memory.instructions(bot) },
    {
      tools: (bot) => plugins.tools(bot),
      instructions: (bot) => plugins.instructions(bot),
      pending: (botId) => plugins.pending(botId),
      inheritance: (leader, references) => plugins.inheritance(leader, references),
    },
  ],
})
const plugins = createPlugins({
  database,
  bots,
  observability: observationSystem.observability,
  secrets: createSecrets(environment.BOT_TEAMS_SECRET_KEY),
  adapters: {
    gmail: createGmailAdapter({
      observability: observationSystem.observability,
      ...(environment.BOT_TEAMS_GOOGLE_CLIENT_ID ? { client: { id: environment.BOT_TEAMS_GOOGLE_CLIENT_ID, ...(environment.BOT_TEAMS_GOOGLE_CLIENT_SECRET ? { secret: environment.BOT_TEAMS_GOOGLE_CLIENT_SECRET } : {}) } } : {}),
    }),
    whatsapp: createWhatsappAdapter({ observability: observationSystem.observability, database }),
    mcp: createMcpAdapter({ observability: observationSystem.observability }),
  },
  conversations: { notify: (botId, event) => conversations.notify(botId, event), addTools: (botId, tools) => conversations.addTools(botId, tools) },
})
const routines = createRoutines({ database, bots, observability: observationSystem.observability, conversations: { call: (routine) => conversations.call(routine) } })
const memory = createMemory({
  database,
  bots,
  observability: observationSystem.observability,
  sessionFactory: piSessionFactory,
  conversations: { active: (botId) => conversations.active(botId), events: () => conversations.events() },
})
const diagnostics = createDiagnostics({
  source: observationSystem.diagnostics,
  versions: {
    app: environment.BOT_TEAMS_APP_VERSION ?? "0.0.0",
    bun: Bun.version,
    electron: environment.BOT_TEAMS_ELECTRON_VERSION ?? "unknown",
  },
  processState: () => ({ engine: engineState, main: mainState }),
  migrationState: database.migrationState,
  exportDirectory: join(dirname(environment.BOT_TEAMS_DATABASE_PATH), "diagnostics"),
  providerState: providers.current,
})
const handler = new RPCHandler(
  createEngineRouter(startedAt, observationSystem.observability, diagnostics, observationSystem.receiver, providers, bots, projects, conversations, tasks, routines, memory, {
    decide: (decision) => piRuntime.resolvePermission(decision),
  }, plugins),
)
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(request) {
    const origin = allowedOrigin(request)

    if (request.headers.has("origin") && !origin) {
      return new Response("Forbidden", { status: 403 })
    }

    if (request.method === "OPTIONS") {
      const headers = new Headers({
        "access-control-allow-headers": "authorization, content-type, x-trace-id, x-parent-span-id",
        "access-control-allow-methods": "GET, POST, OPTIONS",
        "access-control-max-age": "600",
      })

      return withCors(new Response(null, { status: 204, headers }), origin)
    }

    if (request.headers.get("authorization") !== `Bearer ${environment.BOT_TEAMS_ENGINE_TOKEN}`) {
      return withCors(new Response("Unauthorized", { status: 401 }), origin)
    }

    const traceId = request.headers.get("x-trace-id")
    const parentSpanId = request.headers.get("x-parent-span-id")
    const result = await handler.handle(request, {
      prefix: "/rpc",
      context: {
        ...(traceId ? { traceId } : {}),
        ...(parentSpanId ? { spanId: parentSpanId } : {}),
      },
    })

    if (!result.matched) {
      return withCors(new Response("Not found", { status: 404 }), origin)
    }

    return withCors(result.response, origin)
  },
})
engineState = "ready"
plugins.resume()
observationSystem.receiver.span({
  name: "engine.startup",
  timestamp: startupTimestamp,
  durationMs: performance.now() - startupStartedAt,
  outcome: "ok",
  traceId: crypto.randomUUID(),
  spanId: crypto.randomUUID(),
  attributes: { process: "engine", runtime: `Bun ${Bun.version}`, status: "ready" },
})

process.send?.({ type: "ready", port: server.port })

if (!loadProvider) {
  setTimeout(() => {
    deferredPiSessionFactory.warm().catch(() => {})
  }, piWarmDelayMs)
}

let stopping = false

async function drainRequests() {
  const deadline = performance.now() + 5_000

  while (server.pendingRequests > 0 && performance.now() < deadline) {
    await Bun.sleep(25)
  }
}

async function shutdown() {
  if (stopping) {
    return
  }

  stopping = true
  await observationSystem.observability.span(
    { name: "engine.shutdown", attributes: { process: "engine", status: "stopped" } },
    async () => {
      engineState = "stopping"
      void server.stop(false)
      memory.dispose()
      routines.dispose()
      conversations.dispose()
      await plugins.dispose()
      await drainRequests()
      await server.stop(true).catch(() => {
        process.stderr.write("Bun Engine forced shutdown failed\n")
      })
      database.close()
      engineState = "stopped"

      if (mainShutdown) {
        observationSystem.receiver.span({
          name: "main.shutdown",
          timestamp: mainShutdown.timestamp,
          durationMs: performance.now() - mainShutdown.startedAt,
          outcome: "ok",
          traceId: crypto.randomUUID(),
          spanId: crypto.randomUUID(),
          attributes: { process: "main", status: "stopped" },
        })
        mainState = "stopped"
      }
    },
  ).catch(() => {
    process.stderr.write("Bun Engine shutdown failed\n")
  })
  await observationSystem.observability.flush()
  process.exit(0)
}

process.on("SIGTERM", shutdown)
process.on("disconnect", shutdown)
