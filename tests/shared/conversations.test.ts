import { expect, test } from "bun:test"
import { conversationSchemas } from "@src/shared/conversations"

test("conversation boundary converts saved aggregate activity into chronological steps", () => {
  const message = conversationSchemas.message.assert({
    id: "message-1",
    botId: "bot-1",
    author: "bot",
    authorBotId: "bot-1",
    taskId: null,
    content: "Concluído",
    activity: {
      thinkingContent: "Planejando",
      thinkingDurationMs: 5_000,
      tools: [
        { callId: "read-1", name: "read", detail: "README.md", status: "done" },
        { callId: "read-2", name: "read", detail: "PROJECT.md", status: "done" },
      ],
    },
    createdAt: "2026-08-31T15:00:00.000Z",
  })

  expect(message.activity).toEqual({
    steps: [
      { type: "thinking", content: "Planejando", durationMs: 5_000 },
      {
        type: "tool",
        name: "read",
        tools: [
          { callId: "read-1", name: "read", detail: "README.md", status: "done" },
          { callId: "read-2", name: "read", detail: "PROJECT.md", status: "done" },
        ],
      },
    ],
  })
})
