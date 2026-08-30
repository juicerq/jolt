import { createORPCClient } from "@orpc/client"
import { RPCLink } from "@orpc/client/fetch"
import type { ContractRouterClient } from "@orpc/contract"
import { createTanstackQueryUtils } from "@orpc/tanstack-query"
import { engineConnection, engineContract } from "../../shared/engine-contract"

export function createEngineClient(connection: typeof engineConnection.infer) {
  const link = new RPCLink({
    url: connection.url,
    headers: { authorization: `Bearer ${connection.token}` },
  })
  const client: ContractRouterClient<typeof engineContract> = createORPCClient(link)

  return createTanstackQueryUtils(client)
}

export type EngineClient = ReturnType<typeof createEngineClient>
