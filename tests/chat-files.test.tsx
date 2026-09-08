import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { conversationFilePath, splitFilePaths } from "@src/renderer/src/chat/chat-file-paths"
import { createMarkdownRenderer } from "@src/renderer/src/chat/chat-markdown"

const markdown = createMarkdownRenderer({ cacheBytes: 100_000, components: {
  span: ({ node }) => <span data-file={node?.properties.dataFilePath} />,
} })

function render(content: string) {
  return renderToStaticMarkup(markdown.render(content))
}

test.each([
  ["A transcrição está em /home/pedro/Área de trabalho/transcricao-asaas.md. Incluí as mensagens.", "/home/pedro/Área de trabalho/transcricao-asaas.md"],
  ["Abra ~/Documentos/relatorio.pdf, por favor.", "~/Documentos/relatorio.pdf"],
  ["Arquivo C:\\Users\\Pedro\\Meus documentos\\relatorio.xlsx.", "C:\\Users\\Pedro\\Meus documentos\\relatorio.xlsx"],
  ["Veja ./resultados/relatorio.html", "./resultados/relatorio.html"],
  ["Veja resultados/relatorio.html e volte.", "resultados/relatorio.html"],
  ["Veja /tmp/desconto%20.pdf.", "/tmp/desconto%20.pdf"],
  ["Abra '/tmp/relatorio.pdf' agora.", "/tmp/relatorio.pdf"],
])("detects document paths and preserves the surrounding text: %s", (content, path) => {
  const parts = splitFilePaths(content)
  expect(parts.filter((part) => part.path).map((part) => part.path)).toEqual([path])
  expect(parts.map((part) => part.text).join("")).toBe(content)
})

test("renders plain, inline and linked documents without changing code blocks or web links", () => {
  const result = render('Veja /tmp/relatorio.pdf e `/tmp/dados.json`. [Página](</tmp/Área de trabalho/index.html>)\n\n```txt\n/tmp/exemplo.txt\n```\n\n[Site](https://example.com/relatorio.pdf)')
  expect(result).toContain('data-file="/tmp/relatorio.pdf"')
  expect(result).toContain('data-file="/tmp/dados.json"')
  expect(result).toContain('data-file="/tmp/Área de trabalho/index.html"')
  expect(result).toContain('<pre><code class="language-txt">/tmp/exemplo.txt\n</code></pre>')
  expect(result).toContain('href="https://example.com/relatorio.pdf"')
  expect(result.match(/data-file=/g)).toHaveLength(3)
})

test("does not mistake commands, network links or bare code expressions for documents", () => {
  expect(conversationFilePath("cat /tmp/notes.md")).toBeUndefined()
  expect(conversationFilePath("https://example.com/a.md")).toBeUndefined()
  expect(conversationFilePath("file://server/share/a.pdf")).toBeUndefined()
  expect(splitFilePaths("https://example.com/a.pdf").some((part) => part.path)).toBeFalse()
  expect(conversationFilePath("value.map")).toBeUndefined()
  expect(render("`/tmp/main.ts`")).toContain('data-file="/tmp/main.ts"')
  expect(render("`cat /tmp/notes.md`")).not.toContain("data-file")
})

test("supports local file URLs and relative document links, and still rejects unsafe links", () => {
  expect(conversationFilePath("file:///tmp/Meus%20arquivos/a.txt")).toBe("/tmp/Meus arquivos/a.txt")
  expect(render("[Dados](reports/data.csv)")).toContain('data-file="reports/data.csv"')
  expect(render("[Ata](javascript:alert.md)")).not.toContain("data-file")
  expect(render("[Ata](javascript:alert.md)")).not.toContain("javascript:")
})
