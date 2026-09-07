const reconnectDelayMs = 1_000

export function listenEngineStream<T>({ open, connected, handle, closed, label }: {
  open: (signal: AbortSignal) => Promise<AsyncIterable<T>>
  connected?: () => void
  handle: (event: T) => void
  closed?: () => void
  label: string
}) {
  const controller = new AbortController()

  async function consume(events: AsyncIterable<T>) {
    try {
      for await (const event of events) {
        handle(event)
      }
    } finally {
      closed?.()
    }
  }

  async function listen() {
    while (!controller.signal.aborted) {
      try {
        const events = await open(controller.signal)
        connected?.()
        await consume(events)
      } catch (error) {
        if (controller.signal.aborted) {
          return
        }

        console.error(`A conexão com ${label} foi interrompida`, error)
      }

      if (controller.signal.aborted) {
        return
      }

      await new Promise<void>((resolve) => {
        const resume = () => {
          clearTimeout(timer)
          controller.signal.removeEventListener("abort", resume)
          resolve()
        }
        const timer = setTimeout(resume, reconnectDelayMs)
        controller.signal.addEventListener("abort", resume, { once: true })
      })
    }
  }

  void listen()

  return () => controller.abort()
}
