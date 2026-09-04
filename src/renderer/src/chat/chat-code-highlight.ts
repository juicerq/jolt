import type {} from "highlight.js"
import hljs from "highlight.js/lib/core"
import bash from "highlight.js/lib/languages/bash"
import css from "highlight.js/lib/languages/css"
import javascript from "highlight.js/lib/languages/javascript"
import json from "highlight.js/lib/languages/json"
import markdown from "highlight.js/lib/languages/markdown"
import python from "highlight.js/lib/languages/python"
import sql from "highlight.js/lib/languages/sql"
import typescript from "highlight.js/lib/languages/typescript"
import xml from "highlight.js/lib/languages/xml"
import yaml from "highlight.js/lib/languages/yaml"

hljs.registerLanguage("bash", bash)
hljs.registerLanguage("css", css)
hljs.registerLanguage("javascript", javascript)
hljs.registerLanguage("json", json)
hljs.registerLanguage("markdown", markdown)
hljs.registerLanguage("python", python)
hljs.registerLanguage("sql", sql)
hljs.registerLanguage("typescript", typescript)
hljs.registerLanguage("xml", xml)
hljs.registerLanguage("yaml", yaml)

const languageAliases: Record<string, string> = {
  bash: "bash",
  css: "css",
  html: "xml",
  javascript: "javascript",
  js: "javascript",
  json: "json",
  jsx: "javascript",
  markdown: "markdown",
  md: "markdown",
  python: "python",
  py: "python",
  shell: "bash",
  sh: "bash",
  sql: "sql",
  ts: "typescript",
  tsx: "typescript",
  typescript: "typescript",
  yaml: "yaml",
  yml: "yaml",
}

export function highlightChatCode(content: string, className?: string) {
  const languageAlias = className?.match(/(?:^|\s)language-([^\s]+)/)?.[1]?.toLowerCase()

  if (!languageAlias) {
    return
  }

  const language = languageAliases[languageAlias]

  if (!language) {
    return
  }

  return hljs.highlight(content, { language, ignoreIllegals: true }).value
}
