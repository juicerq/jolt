import { beforeEach, describe, expect, test } from "bun:test"
import type { ExternalObservationSpan } from "@src/shared/observability/observation"
import { botsStore, selectBot } from "@src/renderer/src/bots/bots-store"
import { beginConversationOpen, finishConversationOpen } from "@src/renderer/src/chat/chat-open-span"

globalThis.requestAnimationFrame = (callback) => {
  callback(0)

  return 0
}

function recorder() {
  const spans: ExternalObservationSpan[] = []

  return { spans, sender: { async rendererSpan(span: ExternalObservationSpan) { spans.push(span) } } }
}

describe("conversation open span", () => {
  beforeEach(() => {
    botsStore.setState(() => ({ selectedBotId: null, draft: null, dialog: null, screen: null }))
  })

  test("reports one span from the click until the conversation is on screen", () => {
    const { spans, sender } = recorder()

    beginConversationOpen("revisor")
    finishConversationOpen(sender, { botId: "revisor", count: 42, state: "fetched" })
    finishConversationOpen(sender, { botId: "revisor", count: 42, state: "fetched" })

    expect(spans).toHaveLength(1)
    expect(spans[0]).toMatchObject({ name: "renderer.conversationopen", outcome: "ok", attributes: { count: 42, state: "fetched" } })
    expect(spans[0]?.durationMs).toBeGreaterThanOrEqual(0)
  })

  test("ignores a conversation that is not the one being opened", () => {
    const { spans, sender } = recorder()

    beginConversationOpen("revisor")
    beginConversationOpen("redator")
    finishConversationOpen(sender, { botId: "revisor", count: 1, state: "cached" })

    expect(spans).toHaveLength(0)

    finishConversationOpen(sender, { botId: "redator", count: 3, state: "cached" })

    expect(spans.map((span) => span.attributes)).toEqual([{ count: 3, state: "cached" }])
  })

  test("selecting a Bot starts the span and selecting it again does not", () => {
    const { spans, sender } = recorder()

    selectBot("revisor")
    finishConversationOpen(sender, { botId: "revisor", count: 5, state: "fetched" })
    selectBot("revisor")
    finishConversationOpen(sender, { botId: "revisor", count: 5, state: "cached" })

    expect(spans).toHaveLength(1)
  })
})
