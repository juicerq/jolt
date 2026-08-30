import { createORPCClient } from "@orpc/client"
import { RPCLink } from "@orpc/client/fetch"
import type { ContractRouterClient } from "@orpc/contract"
import { createTanstackQueryUtils } from "@orpc/tanstack-query"
import { contract } from "../../shared/contract"

export function createPrototypeClient(connection: { url: string; token: string }) {
  const link = new RPCLink({
    url: connection.url,
    headers: {
      authorization: `Bearer ${connection.token}`,
    },
  })
  const client: ContractRouterClient<typeof contract> = createORPCClient(link)

  return createTanstackQueryUtils(client)
}

export type PrototypeClient = ReturnType<typeof createPrototypeClient>
