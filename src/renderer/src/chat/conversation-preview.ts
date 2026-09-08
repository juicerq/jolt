import remarkGfm from "remark-gfm"
import remarkParse from "remark-parse"
import { unified } from "unified"
import { visit } from "unist-util-visit"

let markdown: ReturnType<typeof buildMarkdownParser> | undefined

function buildMarkdownParser() {
  return unified().use(remarkParse).use(remarkGfm)
}

export function conversationPreview(response: string) {
  const parser = (markdown ??= buildMarkdownParser())
  const spoken: string[] = []

  visit(parser.parse(response), (node) => {
    if (node.type === "text" || node.type === "inlineCode") {
      spoken.push(node.value)
    }
  })

  return spoken.join(" ").replace(/\s+/g, " ").trim()
}

