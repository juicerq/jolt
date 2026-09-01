import { expect, test } from "bun:test"
import {
  addChatDraftImages,
  appendChatThinking,
  chatStore,
  dismissChatRun,
  removeChatDraftImage,
  setChatDraftContent,
  finishChatThinking,
  finishChatTool,
  startChatRun,
  startChatThinking,
  startChatTool,
} from "@src/renderer/src/chat/chat-store"

test("live chat groups consecutive tools without merging separate reasoning periods", () => {
  const botId = crypto.randomUUID()

  startChatRun(botId, { author: "person", authorBotId: null, taskId: null, content: "Inspecione o projeto", images: [] })
  startChatThinking(botId)
  appendChatThinking(botId, "Primeira análise")
  finishChatThinking(botId, 5_000)
  startChatTool(botId, { callId: "read-1", tool: "read", detail: "README.md" })
  finishChatTool(botId, "read-1", false)
  startChatTool(botId, { callId: "read-2", tool: "read", detail: "PROJECT.md" })
  finishChatTool(botId, "read-2", false)
  startChatThinking(botId)
  appendChatThinking(botId, "Segunda análise")
  finishChatThinking(botId, 8_000)

  expect(chatStore.state.runs[botId]?.steps).toEqual([
    { type: "thinking", content: "Primeira análise", durationMs: 5_000, status: "done" },
    {
      type: "tool",
      name: "read",
      tools: [
        { callId: "read-1", name: "read", detail: "README.md", status: "done" },
        { callId: "read-2", name: "read", detail: "PROJECT.md", status: "done" },
      ],
    },
    { type: "thinking", content: "Segunda análise", durationMs: 8_000, status: "done" },
  ])

  dismissChatRun(botId)
})

test("a draft keeps text and images per Bot until the person sends it", () => {
  const botId = crypto.randomUUID()
  const first = { data: "AAAA", mimeType: "image/png" as const }
  const second = { data: "BBBB", mimeType: "image/jpeg" as const }

  setChatDraftContent(botId, "Veja as telas")
  addChatDraftImages(botId, [first, second])
  removeChatDraftImage(botId, 0)

  expect(chatStore.state.drafts[botId]).toEqual({ content: "Veja as telas", images: [second] })

  startChatRun(botId, { author: "person", authorBotId: null, taskId: null, content: "Veja as telas", images: [second] })

  expect(chatStore.state.drafts[botId]).toEqual({ content: "", images: [] })
})
