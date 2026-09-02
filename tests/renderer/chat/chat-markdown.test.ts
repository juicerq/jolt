import { describe, expect, test } from "bun:test"
import { createMarkdownRenderer, stableLength } from "@src/renderer/src/chat/chat-markdown"

describe("Markdown renderer", () => {
  test("returns the same element for the same content", () => {
    const { render } = createMarkdownRenderer({ components: {}, cacheBytes: 1_000 })
    const first = render("# Título\n\n- item")

    expect(render("# Título\n\n- item")).toBe(first)
    expect(render("# Outro")).not.toBe(first)
  })

  test("forgets the oldest content once the cache is over budget", () => {
    const { render } = createMarkdownRenderer({ components: {}, cacheBytes: 20 })
    const first = render("a".repeat(10))

    render("b".repeat(10))
    expect(render("a".repeat(10))).toBe(first)
    render("c".repeat(10))
    expect(render("a".repeat(10))).not.toBe(first)
  })

  test("keeps raw HTML as text and only safe URLs", () => {
    const { render } = createMarkdownRenderer({ components: {}, cacheBytes: 1_000 })
    const html = JSON.stringify(render("<b>x</b> [ok](https://a.b) [no](javascript:alert(1))"))

    expect(html).toContain("\"<b>\",\"x\",\"</b>\"")
    expect(html).toContain("https://a.b")
    expect(html).not.toContain("javascript:")
  })

  test("keeps relative, mailto, and query links with a colon after the path", () => {
    const { render } = createMarkdownRenderer({ components: {}, cacheBytes: 1_000 })
    const html = JSON.stringify(render("[a](docs/guia.md) [b](mailto:eu@x.y) [c](/busca?q=a:b) [d](data:text/html,x)"))

    expect(html).toContain("docs/guia.md")
    expect(html).toContain("mailto:eu@x.y")
    expect(html).toContain("/busca?q=a:b")
    expect(html).not.toContain("data:")
  })
})

describe("streaming Markdown", () => {
  test("the closed blocks keep their element while the tail grows", () => {
    const { renderStreaming } = createMarkdownRenderer({ components: {}, cacheBytes: 10_000 })
    const first = renderStreaming("# Título\n\nPrimeiro parágrafo.\n\nSegundo em and")
    const second = renderStreaming("# Título\n\nPrimeiro parágrafo.\n\nSegundo em andamento")

    expect(first.props.children[0]).toBe(second.props.children[0])
    expect(first.props.children[1]).not.toBe(second.props.children[1])
  })

  test("an open code fence is never split", () => {
    expect(stableLength("Intro\n\n```ts\nconst a = 1\n\nconst b = 2")).toBe("Intro\n\n".length)
    expect(stableLength("```ts\nconst a = 1\n\nconst b = 2")).toBe(0)
    expect(stableLength("Intro\n\n```ts\nconst a = 1\n```\n\nDepois")).toBe("Intro\n\n```ts\nconst a = 1\n```\n\n".length)
  })

  test("content without a closed block renders whole", () => {
    const { render, renderStreaming } = createMarkdownRenderer({ components: {}, cacheBytes: 10_000 })

    expect(renderStreaming("Só uma linha")).toBe(render("Só uma linha"))
  })
})
