interface Pending { content: string; timer: ReturnType<typeof setTimeout> }

export function createChatStreamBuffer({ delayMs, flush }: { delayMs: number; flush: (botId: string, content: string) => void }) {
  const pending = new Map<string, Pending>()

  function drain(botId: string) {
    const entry = pending.get(botId)

    if (!entry) {
      return
    }

    clearTimeout(entry.timer)
    pending.delete(botId)
    flush(botId, entry.content)
  }

  return {
    push(botId: string, content: string) {
      const entry = pending.get(botId)

      if (entry) {
        entry.content += content
        return
      }

      pending.set(botId, { content, timer: setTimeout(() => drain(botId), delayMs) })
    },
    drain,
    drainAll() {
      for (const botId of pending.keys()) {
        drain(botId)
      }
    },
  }
}
