import { describe, expect, test } from "bun:test"
import { createChatStreamBuffer } from "@src/renderer/src/chat/chat-stream-buffer"

function setup() {
  const flushed: { botId: string; kind: string; content: string }[] = []
  const buffer = createChatStreamBuffer({ delayMs: 20, flush: (botId, kind, content) => flushed.push({ botId, kind, content }) })

  return { buffer, flushed }
}

describe("chat stream buffer", () => {
  test("joins the chunks that arrive inside one window into a single flush", async () => {
    const { buffer, flushed } = setup()

    buffer.push("leve", "text", "Res")
    buffer.push("leve", "text", "pos")
    buffer.push("leve", "text", "ta")

    expect(flushed).toEqual([])
    await new Promise((resolve) => setTimeout(resolve, 40))
    expect(flushed).toEqual([{ botId: "leve", kind: "text", content: "Resposta" }])
  })

  test("flushes the previous kind before buffering a different one", () => {
    const { buffer, flushed } = setup()

    buffer.push("leve", "thinking", "Pensando")
    buffer.push("leve", "text", "Resposta")
    buffer.drain("leve")

    expect(flushed).toEqual([{ botId: "leve", kind: "thinking", content: "Pensando" }, { botId: "leve", kind: "text", content: "Resposta" }])
  })

  test("keeps Bots apart and drains everything on demand", () => {
    const { buffer, flushed } = setup()

    buffer.push("leve", "text", "A")
    buffer.push("media", "text", "B")
    buffer.drainAll()
    buffer.drainAll()

    expect(flushed).toEqual([{ botId: "leve", kind: "text", content: "A" }, { botId: "media", kind: "text", content: "B" }])
  })
})
