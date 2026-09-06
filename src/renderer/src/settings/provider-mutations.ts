import { type QueryClient, useMutation, useQueryClient } from "@tanstack/react-query"
import type { EngineClient } from "../engine-client"

export async function refreshProviders(client: EngineClient, queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: client.query.providers.list.queryOptions().queryKey }),
    queryClient.invalidateQueries({ queryKey: client.query.providers.models.queryOptions().queryKey }),
    queryClient.invalidateQueries({ queryKey: client.query.memory.settings.queryOptions().queryKey }),
  ])
}

export function useRefreshProviders(client: EngineClient) {
  const queryClient = useQueryClient()

  return async () => refreshProviders(client, queryClient)
}

export function useDisconnectProvider(client: EngineClient) {
  const refresh = useRefreshProviders(client)

  return useMutation(client.query.providers.disconnect.mutationOptions({ onSuccess: refresh }))
}

export function useRefreshProviderModels(client: EngineClient) {
  const refresh = useRefreshProviders(client)

  return useMutation(client.query.providers.refreshModels.mutationOptions({ onSuccess: refresh }))
}
