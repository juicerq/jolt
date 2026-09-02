import { describe, expect, test } from "bun:test"
import { createMarkdownRenderer } from "@src/renderer/src/chat/chat-markdown"

describe("Markdown renderer", () => {
  test("returns the same element for the same content", () => {
    const render = createMarkdownRenderer({ components: {}, cacheBytes: 1_000 })
    const first = render("# Título\n\n- item")

    expect(render("# Título\n\n- item")).toBe(first)
    expect(render("# Outro")).not.toBe(first)
  })

  test("forgets the oldest content once the cache is over budget", () => {
    const render = createMarkdownRenderer({ components: {}, cacheBytes: 20 })
    const first = render("a".repeat(10))

    render("b".repeat(10))
    expect(render("a".repeat(10))).toBe(first)
    render("c".repeat(10))
    expect(render("a".repeat(10))).not.toBe(first)
  })

  test("keeps raw HTML as text and only safe URLs", () => {
    const render = createMarkdownRenderer({ components: {}, cacheBytes: 1_000 })
    const html = JSON.stringify(render("<b>x</b> [ok](https://a.b) [no](javascript:alert(1))"))

    expect(html).toContain("\"<b>\",\"x\",\"</b>\"")
    expect(html).toContain("https://a.b")
    expect(html).not.toContain("javascript:")
  })
})
