import { describe, expect, test } from "bun:test"
import { earlierMessageBatch, flattenHistory, historyPageInput, olderHistoryPage, recentMessageLimit, windowHistory } from "@src/renderer/src/chat/chat-history-window"

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

describe("history pages", () => {
  const message = (id: string) => ({ id, botId: "b", author: "person" as const, authorBotId: null, taskId: null, content: id, images: [], activity: null, ending: null, createdAt: "2026-09-01T12:00:00.000Z" })

  test("the first page asks for the recent messages and later pages for a batch before a message", () => {
    expect(historyPageInput("b")).toEqual({ botId: "b", limit: recentMessageLimit })
    expect(historyPageInput("b", "m9")).toEqual({ botId: "b", before: "m9", limit: earlierMessageBatch })
  })

  test("the older page starts before the oldest message and stops when nothing is earlier", () => {
    expect(olderHistoryPage({ messages: [message("m3"), message("m4")], earlier: 2 })).toBe("m3")
    expect(olderHistoryPage({ messages: [message("m1")], earlier: 0 })).toBeUndefined()
  })

  test("pages flatten oldest first with the remaining count of the last page", () => {
    const flat = flattenHistory([{ messages: [message("m5"), message("m6")], earlier: 4 }, { messages: [message("m3"), message("m4")], earlier: 2 }])

    expect(flat.messages.map((entry) => entry.id)).toEqual(["m3", "m4", "m5", "m6"])
    expect(flat.earlier).toBe(2)
    expect(flattenHistory([])).toEqual({ messages: [], earlier: 0 })
  })
})
