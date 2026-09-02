import { describe, expect, test } from "bun:test"
import { earlierMessageBatch, recentMessageLimit, windowHistory } from "@src/renderer/src/chat/chat-history-window"

describe("history window", () => {
  test("shows only the most recent messages of a long history", () => {
    const messages = Array.from({ length: 3000 }, (_, index) => index)
    const { visible, hidden } = windowHistory(messages, recentMessageLimit)

    expect(visible).toHaveLength(recentMessageLimit)
    expect(visible.at(-1)).toBe(2999)
    expect(hidden).toBe(3000 - recentMessageLimit)
  })

  test("shows a short history in full without hiding anything", () => {
    expect(windowHistory([1, 2, 3], recentMessageLimit)).toEqual({ visible: [1, 2, 3], hidden: 0 })
  })

  test("reveals one more batch of earlier messages", () => {
    const messages = Array.from({ length: 300 }, (_, index) => index)
    const { visible, hidden } = windowHistory(messages, recentMessageLimit + earlierMessageBatch)

    expect(visible[0]).toBe(300 - recentMessageLimit - earlierMessageBatch)
    expect(hidden).toBe(40)
  })
})
