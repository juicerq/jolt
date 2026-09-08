const reconnectDelayMs = 1_000

export function listenEngineStream<T>({ open, connected, handle, closed, label, probe }: {
  open: (signal: AbortSignal) => Promise<AsyncIterable<T>>
  connected?: () => void
  handle: (event: T) => void
  closed?: () => void
  label: string
  probe?: (signal: AbortSignal) => Promise<unknown>
}) {
  const controller = new AbortController()
  let attempt = new AbortController()

  function reconnect() {
    if (document.visibilityState === "visible") {
      attempt.abort()
    }
  }

  function disconnect() {
    closed?.()
    attempt.abort()
  }

  async function consume() {
    attempt = new AbortController()
    const currentAttempt = attempt
    const signal = AbortSignal.any([controller.signal, currentAttempt.signal])
    const timer = probe ? setInterval(() => {
      void probe(AbortSignal.any([signal, AbortSignal.timeout(5_000)])).catch(() => currentAttempt.abort())
    }, 15_000) : undefined

    try {
      const events = await open(signal)
      connected?.()

      for await (const event of events) {
        handle(event)
      }
    } finally {
      clearInterval(timer)
      closed?.()
    }
  }

  async function listen() {
    while (!controller.signal.aborted) {
      try {
        await consume()
      } catch (error) {
        if (!attempt.signal.aborted && !controller.signal.aborted) {
          console.error(`A conexão com ${label} foi interrompida`, error)
        }
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

  window.addEventListener("offline", disconnect)
  window.addEventListener("online", reconnect)
  document.addEventListener("visibilitychange", reconnect)
  void listen()

  return () => {
    controller.abort()
    window.removeEventListener("offline", disconnect)
    window.removeEventListener("online", reconnect)
    document.removeEventListener("visibilitychange", reconnect)
  }
}
