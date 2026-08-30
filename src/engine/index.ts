import { RPCHandler } from "@orpc/server/fetch"
import { type } from "arktype"
import { dirname, join } from "node:path"
import { forwardedObservation } from "../shared/engine-contract"
import type { processState } from "../shared/observability/diagnostics"
import { createEngineRouter } from "./app/engine-app"
import { createDiagnostics } from "./observability/diagnostics"
import { createObservationSystem } from "./observability/observability"
import { createClaudeProvider } from "./claude/claude-provider"
import { createCodexProvider } from "./codex/codex-provider"
import { createProviderDiscovery } from "./providers/provider-discovery"
import { openDatabase } from "./persistence/database"

const environment = type({
  BOT_TEAMS_ENGINE_TOKEN: "string > 0",
  BOT_TEAMS_DATABASE_PATH: "string > 0",
  "BOT_TEAMS_DEVELOPMENT?": type.enumerated("true", "false"),
  "BOT_TEAMS_APP_VERSION?": "string > 0",
  "BOT_TEAMS_ELECTRON_VERSION?": "string > 0",
}).assert(process.env)
const startedAt = new Date().toISOString()
const observationSystem = createObservationSystem({
  appSessionId: crypto.randomUUID(),
  logDirectory: join(dirname(environment.BOT_TEAMS_DATABASE_PATH), "logs"),
  development: environment.BOT_TEAMS_DEVELOPMENT === "true",
})
let engineState: typeof processState.infer = "starting"
let mainState: typeof processState.infer = "unknown"
let mainShutdown: { timestamp: string; startedAt: number } | undefined

process.on("message", (message) => {
  try {
    const input = forwardedObservation.assert(message)

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
const providers = createProviderDiscovery(observationSystem.observability, [
  createCodexProvider(observationSystem.observability),
  createClaudeProvider(observationSystem.observability),
])
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
  createEngineRouter(startedAt, observationSystem.observability, diagnostics, observationSystem.receiver, providers),
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
