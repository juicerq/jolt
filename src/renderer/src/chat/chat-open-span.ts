import type { EngineClient } from "../engine-client"

interface PendingOpen { botId: string; timestamp: string; startedAt: number }

interface OpenedConversation { botId: string; count: number; state: "cached" | "fetched" }

let pending: PendingOpen | undefined

export function beginConversationOpen(botId: string) {
  pending = { botId, timestamp: new Date().toISOString(), startedAt: performance.now() }
}

export function finishConversationOpen(sender: Pick<EngineClient["raw"]["observations"], "rendererSpan">, opened: OpenedConversation) {
  if (pending?.botId !== opened.botId) {
    return
  }

  const open = pending
  pending = undefined

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      sender.rendererSpan({
        name: "renderer.conversationopen",
        timestamp: open.timestamp,
        durationMs: performance.now() - open.startedAt,
        outcome: "ok",
        traceId: crypto.randomUUID(),
        spanId: crypto.randomUUID(),
        attributes: { count: opened.count, state: opened.state },
      }).catch(() => {})
    })
  })
}
