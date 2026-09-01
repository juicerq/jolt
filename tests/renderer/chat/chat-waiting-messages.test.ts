import { expect, test } from "bun:test"
import { nextChatWaitingMessage } from "@src/renderer/src/chat/chat-waiting-messages"

test("rotates contact messages while keeping the Bot name", () => {
  const first = nextChatWaitingMessage("Marina")
  const second = nextChatWaitingMessage("Marina")

  expect(first).toContain("Marina")
  expect(second).toContain("Marina")
  expect(second).not.toBe(first)
})
