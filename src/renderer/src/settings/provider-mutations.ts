import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { EngineClient } from "../engine-client"

export function useRefreshProviders(client: EngineClient) {
  const queryClient = useQueryClient()

  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: client.query.providers.list.queryOptions().queryKey }),
      queryClient.invalidateQueries({ queryKey: client.query.providers.models.queryOptions().queryKey }),
      queryClient.invalidateQueries({ queryKey: client.query.memory.settings.queryOptions().queryKey }),
    ])
  }
}

export function useDisconnectProvider(client: EngineClient) {
  const refresh = useRefreshProviders(client)

  return useMutation(client.query.providers.disconnect.mutationOptions({ onSuccess: refresh }))
}
