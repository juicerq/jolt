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
  requestChatPermission,
  requestChatPlugin,
  resolveChatPermission,
  resolveChatPlugin,
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

test("permission decisions remove only their own pending request", () => {
  const botId = crypto.randomUUID()

  startChatRun(botId, { author: "person", authorBotId: null, taskId: null, content: "Trabalhe", images: [] })
  requestChatPermission(botId, { id: "note-1", tool: "note", detail: "Prefere PDF" })
  requestChatPermission(botId, { id: "bash-1", tool: "bash", detail: "bun test" })
  resolveChatPermission(botId, "note-1")

  expect(chatStore.state.runs[botId]?.permissionRequests).toEqual([{ id: "bash-1", tool: "bash", detail: "bun test" }])
  expect(chatStore.state.statuses[botId]).toBe("awaiting-decision")

  dismissChatRun(botId)
})

test("a plugin request holds the Bot in awaiting-decision until every request is resolved", () => {
  const botId = crypto.randomUUID()
  const request = { id: "r1", pluginId: "gmail", pluginName: "Gmail", accounts: [], connectable: true }

  startChatRun(botId, { author: "person", authorBotId: null, taskId: null, content: "Conecta o gmail", images: [] })
  requestChatPlugin(botId, request)
  requestChatPermission(botId, { id: "p1", tool: "bash", detail: "ls" })
  expect(chatStore.state.statuses[botId]).toBe("awaiting-decision")
  expect(chatStore.state.runs[botId]?.pluginRequests).toEqual([request])

  resolveChatPermission(botId, "p1")
  expect(chatStore.state.statuses[botId]).toBe("awaiting-decision")

  resolveChatPlugin(botId, "r1")
  expect(chatStore.state.runs[botId]?.pluginRequests).toEqual([])
  expect(chatStore.state.statuses[botId]).toBe("working")
})
