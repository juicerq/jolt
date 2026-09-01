import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { ChatMissingReply } from "@src/renderer/src/chat/chat-missing-reply"
import type { ConversationMessage } from "@src/shared/conversations"

const botId = "marina"

function message(input: Pick<ConversationMessage, "author" | "authorBotId">): ConversationMessage {
  return { id: crypto.randomUUID(), botId, taskId: null, content: "Oi", activity: null, createdAt: "2026-09-01T10:00:00.000Z", ...input }
}

describe("ChatMissingReply", () => {
  test("marks the reply as interrupted when the last message is from the person", () => {
    const markup = renderToStaticMarkup(<ChatMissingReply botId={botId} messages={[message({ author: "person", authorBotId: null })]} />)

    expect(markup).toContain("Resposta interrompida")
  })

  test("marks the reply as interrupted when the last message came from another Bot", () => {
    const markup = renderToStaticMarkup(<ChatMissingReply botId={botId} messages={[message({ author: "bot", authorBotId: "lia" })]} />)

    expect(markup).toContain("Resposta interrompida")
  })

  test("renders nothing when the Bot replied last", () => {
    const markup = renderToStaticMarkup(<ChatMissingReply botId={botId} messages={[message({ author: "person", authorBotId: null }), message({ author: "bot", authorBotId: botId })]} />)

    expect(markup).toBe("")
  })

  test("renders nothing for an empty conversation", () => {
    expect(renderToStaticMarkup(<ChatMissingReply botId={botId} messages={[]} />)).toBe("")
  })
})
