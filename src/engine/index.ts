import { RPCHandler } from "@orpc/server/fetch"
import { type } from "arktype"
import { createEngineRouter } from "./app/engine-app"
import { openDatabase } from "./persistence/database"

const environment = type({
  BOT_TEAMS_ENGINE_TOKEN: "string > 0",
  BOT_TEAMS_DATABASE_PATH: "string > 0",
}).assert(process.env)
const database = openDatabase(environment.BOT_TEAMS_DATABASE_PATH)
const handler = new RPCHandler(createEngineRouter(new Date().toISOString()))

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
        "access-control-allow-headers": "authorization, content-type",
        "access-control-allow-methods": "GET, POST, OPTIONS",
        "access-control-max-age": "600",
      })

      return withCors(new Response(null, { status: 204, headers }), origin)
    }

    if (request.headers.get("authorization") !== `Bearer ${environment.BOT_TEAMS_ENGINE_TOKEN}`) {
      return withCors(new Response("Unauthorized", { status: 401 }), origin)
    }

    const result = await handler.handle(request, { prefix: "/rpc", context: {} })

    if (!result.matched) {
      return withCors(new Response("Not found", { status: 404 }), origin)
    }

    return withCors(result.response, origin)
  },
})

process.send?.({ type: "ready", port: server.port })

process.on("SIGTERM", () => {
  database.close()
  server.stop(true)
  process.exit(0)
})
