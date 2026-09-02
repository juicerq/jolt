import type { Nodes } from "hast"
import { type Components, toJsxRuntime } from "hast-util-to-jsx-runtime"
import { createElement, type ReactElement } from "react"
import { Fragment, jsx, jsxs } from "react/jsx-runtime"
import { defaultUrlTransform } from "react-markdown"
import remarkGfm from "remark-gfm"
import remarkParse from "remark-parse"
import remarkRehype from "remark-rehype"
import { unified } from "unified"
import { visit } from "unist-util-visit"

const urlProperties = ["href", "src"] as const
const fenceLine = /^(`{3,}|~{3,})/gm

export function stableLength(content: string) {
  let boundary = content.lastIndexOf("\n\n")

  while (boundary > 0) {
    const head = content.slice(0, boundary + 2)
    const fences = head.match(fenceLine)?.length ?? 0

    if (fences % 2 === 0) {
      return head.length
    }

    boundary = content.lastIndexOf("\n\n", boundary - 1)
  }

  return 0
}

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

  function render(content: string) {
    const cached = cache.get(content)

    if (cached) {
      return cached
    }

    const element = parse(content)

    remember(content, element)

    return element
  }

  function renderStreaming(content: string) {
    const stable = stableLength(content)

    if (stable === 0) {
      return render(content)
    }

    return createElement(Fragment, null, render(content.slice(0, stable)), render(content.slice(stable)))
  }

  return { render, renderStreaming }
}
