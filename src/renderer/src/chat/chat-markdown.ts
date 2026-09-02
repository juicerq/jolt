import type { Nodes } from "hast"
import { type Components, toJsxRuntime } from "hast-util-to-jsx-runtime"
import type { ReactElement } from "react"
import { Fragment, jsx, jsxs } from "react/jsx-runtime"
import { defaultUrlTransform } from "react-markdown"
import remarkGfm from "remark-gfm"
import remarkParse from "remark-parse"
import remarkRehype from "remark-rehype"
import { unified } from "unified"
import { visit } from "unist-util-visit"

const urlProperties = ["href", "src"] as const

export function createMarkdownRenderer({ components, cacheBytes }: { components: Partial<Components>; cacheBytes: number }) {
  const processor = unified().use(remarkParse).use(remarkGfm).use(remarkRehype, { allowDangerousHtml: true })
  const cache = new Map<string, ReactElement>()
  let cachedBytes = 0

  function parse(content: string) {
    const tree: Nodes = processor.runSync(processor.parse(content))

    visit(tree, (node, index, parent) => {
      if (node.type === "raw" && parent && typeof index === "number") {
        parent.children[index] = { type: "text", value: node.value }

        return index
      }

      if (node.type === "element") {
        for (const property of urlProperties) {
          if (Object.hasOwn(node.properties, property)) {
            node.properties[property] = defaultUrlTransform(String(node.properties[property] ?? ""))
          }
        }
      }

      return undefined
    })

    return toJsxRuntime(tree, { Fragment, components, ignoreInvalidStyle: true, jsx, jsxs, passKeys: true, passNode: true })
  }

  function remember(content: string, element: ReactElement) {
    cache.set(content, element)
    cachedBytes += content.length

    for (const [oldest] of cache) {
      if (cachedBytes <= cacheBytes) {
        return
      }

      cache.delete(oldest)
      cachedBytes -= oldest.length
    }
  }

  return function render(content: string) {
    const cached = cache.get(content)

    if (cached) {
      return cached
    }

    const element = parse(content)

    remember(content, element)

    return element
  }
}
