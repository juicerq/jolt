import { createORPCClient } from "@orpc/client"
import { RPCLink } from "@orpc/client/fetch"
import type { ContractRouterClient } from "@orpc/contract"
import { createTanstackQueryUtils } from "@orpc/tanstack-query"
import type { engineContract } from "../../shared/engine-contract"
import type { EngineConnection } from "../../shared/engine-ipc"

export function createEngineClient(connection: EngineConnection) {
  const senderLink = new RPCLink({
    url: connection.url,
    headers: { authorization: `Bearer ${connection.token}` },
  })
  const sender: ContractRouterClient<typeof engineContract> = createORPCClient(senderLink)
  const link = new RPCLink({
    url: connection.url,
    headers: { authorization: `Bearer ${connection.token}` },
    async fetch(request, init, _options, path) {
      const operation = path.join(".")

      if (operation === "diagnostics.get" || operation === "observations.rendererSpan") {
        return fetch(request, init)
      }

      const traceId = crypto.randomUUID()
      const spanId = crypto.randomUUID()
      const startedAt = performance.now()
      request.headers.set("x-trace-id", traceId)
      request.headers.set("x-parent-span-id", spanId)

      try {
        const response = await fetch(request, init)
        void sender.observations.rendererSpan({
          name: "renderer.rpc",
          timestamp: new Date().toISOString(),
          durationMs: performance.now() - startedAt,
          outcome: response.ok ? "ok" : "error",
          traceId,
          spanId,
          attributes: { method: request.method, code: String(response.status) },
        }).catch(() => undefined)

        return response
      } catch (error) {
        if (request.signal.aborted) {
          throw error
        }

        void sender.observations.rendererSpan({
          name: "renderer.rpc",
          timestamp: new Date().toISOString(),
          durationMs: performance.now() - startedAt,
          outcome: "error",
          traceId,
          spanId,
          attributes: { method: request.method },
          error: { type: "RequestError", message: "Request failed" },
        }).catch(() => undefined)

        throw error
      }
    },
  })
  const client: ContractRouterClient<typeof engineContract> = createORPCClient(link)
  const queryUtils = createTanstackQueryUtils(client)

  return { query: queryUtils, raw: client }
}

export type EngineClient = ReturnType<typeof createEngineClient>
