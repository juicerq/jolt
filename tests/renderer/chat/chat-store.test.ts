import { expect, test } from "bun:test"
import {
  appendChatThinking,
  chatStore,
  dismissChatRun,
  finishChatThinking,
  finishChatTool,
  startChatRun,
  startChatThinking,
  startChatTool,
} from "@src/renderer/src/chat/chat-store"

test("live chat groups consecutive tools without merging separate reasoning periods", () => {
  const botId = crypto.randomUUID()

  startChatRun(botId, { author: "person", authorBotId: null, taskId: null, content: "Inspecione o projeto" })
  startChatThinking(botId)
  appendChatThinking(botId, "Primeira análise")
  finishChatThinking(botId, 5_000)
  startChatTool(botId, "read-1", "read", "README.md")
  finishChatTool(botId, "read-1", false)
  startChatTool(botId, "read-2", "read", "PROJECT.md")
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
