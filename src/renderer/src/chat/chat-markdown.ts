import type { Element, Nodes } from "hast"
import { type Components, toJsxRuntime } from "hast-util-to-jsx-runtime"
import type { ReactElement } from "react"
import { Fragment, jsx, jsxs } from "react/jsx-runtime"
import remarkGfm from "remark-gfm"
import remarkParse from "remark-parse"
import remarkRehype from "remark-rehype"
import { unified } from "unified"
import { conversationFilePath, splitFilePaths } from "./chat-file-paths"
import { SKIP, visit } from "unist-util-visit"

const urlProperties = ["href", "src"] as const
const urlDelimiters = ["/", "?", "#"]
const safeProtocol = /^(https?|ircs?|mailto|xmpp)$/i

function safeUrl(value: string) {
  const colon = value.indexOf(":")
  const firstDelimiter = Math.min(...urlDelimiters.map((mark) => value.indexOf(mark)).filter((index) => index !== -1))
  const relative = colon === -1 || colon > firstDelimiter
  const allowed = safeProtocol.test(value.slice(0, colon))

  if (relative || allowed) {
    return value
  }

  return ""
}

function linkedFilePath(value: string) {
  try {
    return conversationFilePath(value.startsWith("file:") ? value : decodeURIComponent(value))
  } catch {
    return
  }
}

function fileElement(node: Element) {
  const value = node.tagName === "a" ? String(node.properties.href ?? "") : node.children.filter((child) => child.type === "text").map((child) => child.value).join("")
  const file = node.tagName === "a" ? linkedFilePath(value) : conversationFilePath(value)

  if (!file) {
    return
  }

  const children = node.tagName === "code" ? [{ ...node }] : node.children

  node.tagName = "span"
  node.properties = { dataFilePath: file }
  node.children = children
}

export function createMarkdownRenderer({ components, cacheBytes, detectFiles = true }: { components: Partial<Components>; cacheBytes: number; detectFiles?: boolean }) {
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
        // File links are converted before URL sanitization removes file: URLs.
        if (detectFiles && node.tagName === "a") {
          fileElement(node)
        }

        for (const property of urlProperties) {
          if (Object.hasOwn(node.properties, property)) {
            node.properties[property] = safeUrl(String(node.properties[property] ?? ""))
          }
        }
      }

      return
    })
    visit(tree, (node, index, parent) => {
      if (!detectFiles) { return SKIP }

      if (node.type === "element") {
        if (node.tagName === "pre" || node.tagName === "a" || node.properties.dataFilePath) {
          return SKIP
        }

        if (node.tagName === "code") {
          fileElement(node)

          return SKIP
        }
      }

      if (node.type === "text" && parent && typeof index === "number") {
        const parts = splitFilePaths(node.value)

        if (parts.some((part) => part.path)) {
          parent.children.splice(index, 1, ...parts.map((part) => part.path
            ? { type: "element" as const, tagName: "span", properties: { dataFilePath: part.path }, children: [{ type: "text" as const, value: part.text }] }
            : { type: "text" as const, value: part.text }))

          return index + parts.length
        }
      }

      return
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

  return { render }
}
