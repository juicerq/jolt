import type { QueuedMessage } from "../../shared/conversations"

type QueueEntry = Pick<QueuedMessage, "content" | "images">

export function createMessageQueue() {
  const byBot = new Map<string, QueuedMessage[]>()

  function list(botId: string) {
    return byBot.get(botId) ?? []
  }

  function replace(botId: string, messages: QueuedMessage[]) {
    if (messages.length === 0) {
      byBot.delete(botId)

      return
    }

    byBot.set(botId, messages)
  }

  return {
    list,
    all() {
      return Array.from(byBot.entries())
    },
    add(botId: string, entry: QueueEntry) {
      const message: QueuedMessage = { id: crypto.randomUUID(), ...entry, promoted: false, createdAt: new Date().toISOString() }

      replace(botId, [...list(botId), message])

      return message
    },
    restore(botId: string, message: QueuedMessage) {
      replace(botId, [message, ...list(botId)])
    },
    promote(botId: string, id: string) {
      const messages = list(botId)
      const message = messages.find((candidate) => candidate.id === id)

      if (!message) {
        return undefined
      }

      const promoted = { ...message, promoted: true }

      replace(botId, [promoted, ...messages.filter((candidate) => candidate.id !== id)])

      return promoted
    },
    take(botId: string, id: string) {
      const messages = list(botId)
      const message = messages.find((candidate) => candidate.id === id)

      if (!message) {
        return undefined
      }

      replace(botId, messages.filter((candidate) => candidate.id !== id))

      return message
    },
    clear(botId: string) {
      byBot.delete(botId)
    },
  }
}
