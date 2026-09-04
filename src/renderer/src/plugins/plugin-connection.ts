import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import type { PluginConnectInput, PluginStep } from "../../../shared/plugins"
import type { EngineClient } from "../engine-client"

export function useConnectPlugin(client: EngineClient, onConnected?: () => void) {
  const queryClient = useQueryClient()
  const [step, setStep] = useState<PluginStep>()

  async function follow(connectionId: string) {
    const steps = await client.raw.plugins.connectionSteps({ connectionId })

    for await (const next of steps) {
      setStep(next)

      if (next.type === "browser") {
        await window.desktop.openInBrowser(next.url)
      }
    }
  }

  const { mutate, isPending, error, variables } = useMutation({
    async mutationFn(input: PluginConnectInput) {
      setStep(undefined)
      const started = await client.raw.plugins.connect(input)
      void follow(started.connectionId).catch(() => {})

      return client.raw.plugins.awaitConnection({ connectionId: started.connectionId })
    },
    onSettled() {
      setStep(undefined)
    },
    onSuccess() {
      queryClient.invalidateQueries({ queryKey: client.query.plugins.list.queryOptions().queryKey })
      onConnected?.()
    },
  })

  return { connect: mutate, isPending, error, step, connecting: isPending ? variables : undefined }
}
