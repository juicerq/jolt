import { createORPCClient } from "@orpc/client"
import { RPCLink } from "@orpc/client/fetch"
import type { ContractRouterClient } from "@orpc/contract"
import { createTanstackQueryUtils } from "@orpc/tanstack-query"
import type { engineContract } from "@src/shared/engine-contract"
import type { EngineConnection } from "@src/shared/engine-ipc"
import type { ExternalObservationSpan } from "@src/shared/observability/observation"

export function createEngineClient(connection: EngineConnection) {
  let { token } = connection
  let renewal: Promise<boolean> | undefined
  const headers = () => ({ authorization: `Bearer ${token}` })

  function renew() {
    renewal ??= window.desktop.renewEngineConnection().then((renewed) => {
      token = renewed?.token ?? token

      return !!renewed
    }).finally(() => {
      renewal = undefined
    })

    return renewal
  }

  async function authorizedFetch(request: Request, init: RequestInit) {
    const retry = request.clone()
    const response = await fetch(request, init)

    if (response.status !== 401 || !(await renew())) {
      return response
    }

    retry.headers.set("authorization", headers().authorization)

    return fetch(retry, init)
  }

  const link = new RPCLink({
    url: connection.url,
    headers,
    async fetch(request, init, _options, path) {
      const operation = path.join(".")

      if (operation === "diagnostics.get" || operation === "observations.rendererSpan" || operation === "browser.frame") {
        return authorizedFetch(request, init)
      }

      const traceId = crypto.randomUUID()
      const spanId = crypto.randomUUID()
      const startedAt = performance.now()
      request.headers.set("x-trace-id", traceId)
      request.headers.set("x-parent-span-id", spanId)

      function report(span: Pick<ExternalObservationSpan, "outcome" | "attributes" | "error">) {
        void client.observations.rendererSpan({ name: "renderer.rpc", timestamp: new Date().toISOString(), durationMs: performance.now() - startedAt, traceId, spanId, ...span }).catch(() => {})
      }

      try {
        const response = await authorizedFetch(request, init)
        report({ outcome: response.ok ? "ok" : "error", attributes: { method: request.method, code: String(response.status) } })

        return response
      } catch (error) {
        if (request.signal.aborted) {
          throw error
        }

        report({ outcome: "error", attributes: { method: request.method }, error: { type: "RequestError", message: "Request failed" } })

        throw error
      }
    },
  })
  const client: ContractRouterClient<typeof engineContract> = createORPCClient(link)
  const queryUtils = createTanstackQueryUtils(client)

  return { query: queryUtils, raw: client }
}

export type EngineClient = ReturnType<typeof createEngineClient>
