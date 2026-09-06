import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import type { PluginConnectInput, PluginStep } from "@src/shared/plugins"
import type { EngineClient } from "../engine-client"

export function useConnectPlugin(client: EngineClient, onConnected?: () => void) {
  const queryClient = useQueryClient()
  const [step, setStep] = useState<PluginStep>()

  async function follow(connectionId: string, signal: AbortSignal) {
    const steps = await client.raw.plugins.connectionSteps({ connectionId }, { signal })

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
      const controller = new AbortController()

      try {
        const [, snapshot] = await Promise.all([
          follow(started.connectionId, controller.signal),
          client.raw.plugins.awaitConnection({ connectionId: started.connectionId }),
        ])

        return snapshot
      } finally {
        controller.abort()
      }
    },
    onSettled() {
      setStep(undefined)
    },
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: client.query.plugins.list.queryOptions().queryKey })
      onConnected?.()
    },
  })

  return { connect: mutate, isPending, error, step, connecting: isPending ? variables : undefined }
}
