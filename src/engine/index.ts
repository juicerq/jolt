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
import { createPiAgentRuntime, deferPiSessionFactory } from "./pi/pi-agent-runtime"
import { createPiLoadSessionFactory } from "./pi/pi-load-session"
import { codexDefaultModelId, createPiProvider } from "./pi/pi-provider"
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

    return url.protocol === "http:" && loopback ? origin : undefined
  } catch {
    return undefined
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

const startupTimestamp = new Date().toISOString()
const startupStartedAt = performance.now()
const database = openDatabase(environment.BOT_TEAMS_DATABASE_PATH, observationSystem.observability)
const providers = createPiProvider(observationSystem.observability)
const bots = createBots({
  database,
  observability: observationSystem.observability,
  privateBotsDirectory: environment.BOT_TEAMS_PRIVATE_BOTS_DIRECTORY,
  providers,
  conversations: { close: (botId) => conversations.close(botId) },
})
const projects = createProjects({ database, observability: observationSystem.observability, bots })
const piDirectory = join(dirname(environment.BOT_TEAMS_DATABASE_PATH), "pi")
const piSessionFactory = environment.BOT_TEAMS_LOAD_PROVIDER === "true"
  ? createPiLoadSessionFactory()
  : deferPiSessionFactory(async () => {
    const { createPiSessionFactory } = await import("./pi/pi-session-adapter")

    return createPiSessionFactory({
      agentDirectory: join(piDirectory, "agent"),
      sessionsDirectory: join(piDirectory, "sessions"),
      modelId: codexDefaultModelId,
    })
  })
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
  ],
})
const routines = createRoutines({ database, bots, observability: observationSystem.observability, conversations: { call: (botId, content) => conversations.call(botId, content) } })
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
  createEngineRouter(startedAt, observationSystem.observability, diagnostics, observationSystem.receiver, providers, bots, projects, conversations, tasks, routines, memory),
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

let stopping = false

process.on("SIGTERM", async () => {
  if (stopping) {
    return
  }

  stopping = true
  await observationSystem.observability.span(
    { name: "engine.shutdown", attributes: { process: "engine", status: "stopped" } },
    async () => {
      engineState = "stopping"
      let timeout: ReturnType<typeof setTimeout> | undefined
      const gracefulStop = server.stop(false)
      const result = await Promise.race([
        gracefulStop.then(() => "stopped" as const, () => "failed" as const),
        new Promise<"timeout">((resolve) => {
          timeout = setTimeout(() => resolve("timeout"), 5_000)
        }),
      ])

      if (timeout) {
        clearTimeout(timeout)
      }

      if (result !== "stopped") {
        await server.stop(true).catch(() => {
          process.stderr.write("Bun Engine forced shutdown failed\n")
        })
      }

      memory.dispose()
      routines.dispose()
      conversations.dispose()
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
})
