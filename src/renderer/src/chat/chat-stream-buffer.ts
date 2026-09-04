type ChunkKind = "text" | "thinking"

interface Pending { kind: ChunkKind; content: string; timer: ReturnType<typeof setTimeout> }

export function createChatStreamBuffer({ delayMs, flush }: { delayMs: number; flush(botId: string, kind: ChunkKind, content: string): void }) {
  const pending = new Map<string, Pending>()

  function drain(botId: string) {
    const entry = pending.get(botId)

    if (!entry) {
      return
    }

    clearTimeout(entry.timer)
    pending.delete(botId)
    flush(botId, entry.kind, entry.content)
  }

  return {
    push(botId: string, kind: ChunkKind, content: string) {
      const entry = pending.get(botId)

      if (entry?.kind === kind) {
        entry.content += content
        return
      }

      drain(botId)
      pending.set(botId, { kind, content, timer: setTimeout(() => drain(botId), delayMs) })
    },
    drain,
    drainAll() {
      for (const botId of pending.keys()) {
        drain(botId)
      }
    },
  }
}
