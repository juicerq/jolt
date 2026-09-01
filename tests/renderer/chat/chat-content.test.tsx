import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { ChatContent } from "@src/renderer/src/chat/chat-content"

describe("ChatContent", () => {
  test("renders the Markdown a Bot sends as readable chat content", () => {
    const markup = renderToStaticMarkup(
      <ChatContent content={[
        "## Resultado",
        "",
        "- Primeiro item",
        "- Segundo item com `inline()`",
        "",
        "```ts",
        "const answer = 42",
        "```",
        "",
        "| Nome | Estado |",
        "| --- | --- |",
        "| Jots | pronto |",
      ].join("\n")} />,
    )

    expect(markup).toMatch(/<h2[^>]*>Resultado<\/h2>/)
    expect(markup).toContain("<ul")
    expect(markup).toMatch(/<code[^>]*>inline\(\)<\/code>/)
    expect(markup).toContain("<pre")
    expect(markup).not.toContain("<header")
    expect(markup).not.toContain("TypeScript")
    expect(markup).toMatch(/<button[^>]*aria-label="Copiar código"[^>]*>/)
    expect(markup).toContain('data-tooltip="Copiar código"')
    expect(markup).toContain('<span class="hljs-keyword">const</span>')
    expect(markup).toContain('<span class="hljs-number">42</span>')
    expect(markup).toContain("<table")
  })

  test("escapes HTML inside highlighted code", () => {
    const markup = renderToStaticMarkup(<ChatContent content={"```ts\n<script>alert(1)</script>\n```"} />)

    expect(markup).toContain("&lt;script&gt;")
    expect(markup).not.toContain("<script>")
  })

  test("keeps links outside the Electron document", () => {
    const markup = renderToStaticMarkup(<ChatContent content="[Documentação](https://example.com/docs)" />)

    expect(markup).toContain('href="https://example.com/docs"')
    expect(markup).toContain('target="_blank"')
    expect(markup).toContain('rel="noreferrer"')
  })
})
