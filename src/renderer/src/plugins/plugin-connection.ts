import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { PluginConnectInput } from "../../../shared/plugins"
import type { EngineClient } from "../engine-client"

export function useConnectPlugin(client: EngineClient, onConnected?: () => void) {
  const queryClient = useQueryClient()
  const { mutate, isPending, error, variables } = useMutation({
    async mutationFn(input: PluginConnectInput) {
      const started = await client.raw.plugins.connect(input)

      if (started.authorizationUrl) {
        await window.desktop.openInBrowser(started.authorizationUrl)
      }

      return client.raw.plugins.awaitConnection({ connectionId: started.connectionId })
    },
    onSuccess() {
      queryClient.invalidateQueries({ queryKey: client.query.plugins.list.queryOptions().queryKey })
      onConnected?.()
    },
  })

  return { connect: mutate, isPending, error, connecting: isPending ? variables : undefined }
}
