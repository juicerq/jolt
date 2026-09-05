import { z } from "zod"
import { parse } from "../src/shared/parse"

const targets = z.array(z.object({ type: z.string(), title: z.string(), webSocketDebuggerUrl: z.string() }))
const reply = z.object({ id: z.number(), result: z.unknown().optional(), error: z.object({ message: z.string() }).optional() })
const evaluation = z.object({ result: z.object({ value: z.unknown().optional() }), exceptionDetails: z.object({ text: z.string() }).optional() })

export async function connectCdp(port: string) {
  const listed = parse(targets, await (await fetch(`http://127.0.0.1:${port}/json`)).json())
  const page = listed.find((target) => target.type === "page" && target.title === "Jolt")

  if (!page) {
    throw new Error("No Jolt renderer on the CDP port")
  }

  const socket = new WebSocket(page.webSocketDebuggerUrl)
  const pending = new Map<number, ReturnType<typeof Promise.withResolvers<z.infer<typeof reply>>>>()
  let nextId = 0

  await new Promise<void>((resolve, reject) => {
    socket.onopen = () => resolve()
    socket.onerror = () => reject(new Error("CDP socket failed"))
  })

  socket.onmessage = (event) => {
    const message = parse(reply, JSON.parse(String(event.data)))

    pending.get(message.id)?.resolve(message)
  }

  socket.onclose = () => {
    for (const request of pending.values()) {
      request.reject(new Error("CDP connection closed"))
    }
  }

  async function call<T>(method: string, schema: z.ZodType<T>, params: Record<string, unknown> = {}) {
    if (socket.readyState !== WebSocket.OPEN) {
      throw new Error("CDP connection is not open")
    }

    nextId += 1

    const id = nextId
    const request = Promise.withResolvers<z.infer<typeof reply>>()
    const timeout = setTimeout(() => request.reject(new Error(`${method} timed out`)), 30_000)
    pending.set(id, request)

    try {
      socket.send(JSON.stringify({ id, method, params }))
      const message = await request.promise

      if (message.error) {
        throw new Error(`${method} failed: ${message.error.message}`)
      }

      return parse(schema, message.result)
    } finally {
      clearTimeout(timeout)
      pending.delete(id)
    }
  }

  return {
    call,
    async evaluate<T>(expression: string, schema: z.ZodType<T>) {
      const outcome = await call("Runtime.evaluate", evaluation, { expression, returnByValue: true, awaitPromise: true })

      if (outcome.exceptionDetails) {
        throw new Error(`Page script failed: ${outcome.exceptionDetails.text}`)
      }

      return parse(schema, outcome.result.value)
    },
    close() {
      socket.close()
    },
  }
}
