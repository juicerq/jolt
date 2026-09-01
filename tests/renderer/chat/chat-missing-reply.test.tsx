import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { ChatMissingReply } from "@src/renderer/src/chat/chat-missing-reply"
import type { ConversationMessage } from "@src/shared/conversations"

const bot = { id: "marina", name: "Marina" }

function message(input: Pick<ConversationMessage, "author" | "authorBotId">): ConversationMessage {
  return { id: crypto.randomUUID(), botId: bot.id, taskId: null, content: "Oi", activity: null, createdAt: "2026-09-01T10:00:00.000Z", ...input }
}

describe("ChatMissingReply", () => {
  test("marks the Bot as not replied when the last message is from the person", () => {
    const markup = renderToStaticMarkup(<ChatMissingReply bot={bot} messages={[message({ author: "person", authorBotId: null })]} />)

    expect(markup).toContain("Marina não respondeu")
  })

  test("marks the Bot as not replied when the last message came from another Bot", () => {
    const markup = renderToStaticMarkup(<ChatMissingReply bot={bot} messages={[message({ author: "bot", authorBotId: "lia" })]} />)

    expect(markup).toContain("Marina não respondeu")
  })

  test("renders nothing when the Bot replied last", () => {
    const markup = renderToStaticMarkup(<ChatMissingReply bot={bot} messages={[message({ author: "person", authorBotId: null }), message({ author: "bot", authorBotId: bot.id })]} />)

    expect(markup).toBe("")
  })

  test("renders nothing for an empty conversation", () => {
    expect(renderToStaticMarkup(<ChatMissingReply bot={bot} messages={[]} />)).toBe("")
  })
})
