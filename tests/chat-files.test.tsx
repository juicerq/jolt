import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { conversationFilePath, splitFilePaths } from "@src/renderer/src/chat/chat-file-paths"
import { createMarkdownRenderer } from "@src/renderer/src/chat/chat-markdown"

const markdown = createMarkdownRenderer({ cacheBytes: 100_000, components: {
  span: ({ node, children }) => <span data-file={node?.properties.dataFilePath}>{children}</span>,
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

test("retains original text, inline code and link labels until a file is verified", () => {
  expect(render("incluindo `relatorios/2026-09-10.md`, `fontes.md`"))
    .toBe('<p>incluindo <span data-file="relatorios/2026-09-10.md"><code>relatorios/2026-09-10.md</code></span>, <span data-file="fontes.md"><code>fontes.md</code></span></p>')
  expect(render("Veja /tmp/relatorio.pdf."))
    .toBe('<p>Veja <span data-file="/tmp/relatorio.pdf">/tmp/relatorio.pdf</span>.</p>')
  expect(render("[Leia o **relatório**](relatorios/2026-09-10.md)"))
    .toBe('<p><span data-file="relatorios/2026-09-10.md">Leia o <strong>relatório</strong></span></p>')
})

test("sanitizes content preserved inside an unverified file link", () => {
  expect(render('[<img src=x onerror=alert(1)>](/tmp/relatorio.pdf)'))
    .toContain("&lt;img src=x onerror=alert(1)&gt;")
})

test("document rendering preserves relative links and images without chat file chips", () => {
  const document = createMarkdownRenderer({ cacheBytes: 100_000, detectFiles: false, components: {} })
  const result = renderToStaticMarkup(document.render('# Entrega\n\n[Briefing](campanha/briefing.md)\n\n![Arte](imagens/arte.png)\n\n`notas.md`\n\n[Inválido](javascript:alert.md)'))

  expect(result).toContain('<h1>Entrega</h1>')
  expect(result).toContain('href="campanha/briefing.md"')
  expect(result).toContain('src="imagens/arte.png"')
  expect(result).toContain('<code>notas.md</code>')
  expect(result).not.toContain("data-file")
  expect(result).not.toContain("javascript:")
})
