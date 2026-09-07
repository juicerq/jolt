import type { RPCHandler } from "@orpc/server/fetch"
import { timingSafeEqual } from "node:crypto"
import { join, resolve, sep } from "node:path"
import type { EngineAccess } from "@src/shared/engine-ipc"
import type { EngineContext } from "./engine-app"

interface EngineServerOptions {
  port: number
  access: EngineAccess
  rendererDirectory?: string
  handler: Pick<RPCHandler<EngineContext>, "handle">
}

const rpcPrefix = "/rpc"
const preflightHeaders = {
  "access-control-allow-headers": "authorization, content-type, x-trace-id, x-parent-span-id",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-max-age": "600",
}

function isLoopbackOrigin(origin: string) {
  try {
    const url = new URL(origin)

    return url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost")
  } catch {
    return false
  }
}

function withCors(response: Response, origin: string | null) {
  if (!origin) {
    return response
  }

  const headers = new Headers(response.headers)
  headers.set("access-control-allow-origin", origin)
  headers.set("vary", "Origin")

  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

function notFound() {
  return new Response("Not found", { status: 404 })
}

function rendererFile(directory: string, pathname: string) {
  try {
    const path = resolve(directory, `.${decodeURIComponent(pathname)}`)

    if (path === directory) {
      return join(directory, "index.html")
    }

    if (path.startsWith(`${directory}${sep}`)) {
      return path
    }

    return
  } catch {
    return
  }
}

async function serveRendererFile(directory: string, pathname: string) {
  const path = rendererFile(directory, pathname)
  const file = path ? Bun.file(path) : undefined

  if (!file || !(await file.exists())) {
    return notFound()
  }

  const cacheControl = pathname.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache"

  return new Response(file, { headers: { "cache-control": cacheControl } })
}

function listen(port: number, fetch: (request: Request) => Promise<Response>) {
  try {
    return Bun.serve({ hostname: "127.0.0.1", port, fetch })
  } catch (error) {
    if (port === 0 || !(error instanceof Error && "code" in error && error.code === "EADDRINUSE")) {
      throw error
    }

    return Bun.serve({ hostname: "127.0.0.1", port: 0, fetch })
  }
}

export function createEngineServer({ port, access: initialAccess, rendererDirectory, handler }: EngineServerOptions) {
  const directory = rendererDirectory ? resolve(rendererDirectory) : undefined
  let access = initialAccess
  let generation = new AbortController()

  function allowed(origin: string) {
    return origin === "null" || isLoopbackOrigin(origin) || origin === access.origin
  }

  function authorized(request: Request) {
    const expected = Buffer.from(`Bearer ${access.token}`)
    const given = Buffer.from(request.headers.get("authorization") ?? "")

    return given.length === expected.length && timingSafeEqual(given, expected)
  }

  async function rpc(request: Request) {
    if (!authorized(request)) {
      return new Response("Unauthorized", { status: 401 })
    }

    const traceId = request.headers.get("x-trace-id")
    const parentSpanId = request.headers.get("x-parent-span-id")
    const scoped = new Request(request, { signal: AbortSignal.any([request.signal, generation.signal]) })
    const result = await handler.handle(scoped, {
      prefix: rpcPrefix,
      context: {
        ...(traceId ? { traceId } : {}),
        ...(parentSpanId ? { spanId: parentSpanId } : {}),
      },
    })

    if (!result.matched) {
      return notFound()
    }

    return result.response
  }

  const server = listen(port, async (request) => {
    const origin = request.headers.get("origin")

    if (origin && !allowed(origin)) {
      return new Response("Forbidden", { status: 403 })
    }

    if (request.method === "OPTIONS") {
      return withCors(new Response(null, { status: 204, headers: preflightHeaders }), origin)
    }

    const { pathname } = new URL(request.url)

    if (pathname === rpcPrefix || pathname.startsWith(`${rpcPrefix}/`)) {
      return withCors(await rpc(request), origin)
    }

    if (directory && request.method === "GET") {
      return serveRendererFile(directory, pathname)
    }

    return notFound()
  })

  return {
    port: server.port,
    get pendingRequests() {
      return server.pendingRequests
    },
    grant(next: EngineAccess) {
      if (next.token !== access.token) {
        generation.abort()
        generation = new AbortController()
      }

      access = next
    },
    stop(force: boolean) {
      return server.stop(force)
    },
  }
}
