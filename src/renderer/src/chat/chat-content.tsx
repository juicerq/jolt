import { CheckIcon, ClipboardDocumentIcon } from "@heroicons/react/24/outline"
import { isValidElement, type ReactNode, useState } from "react"
import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { IconButton } from "../ui/icon-button"
import { highlightChatCode } from "./chat-code-highlight"

export function ChatContent({ content, streaming = false }: { content: string; streaming?: boolean }) {
  return (
    <div className="chat-content">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ children, ...props }) => <a {...props} target="_blank" rel="noreferrer">{children}</a>,
          pre: ({ children }) => <ChatCodeBlock>{children}</ChatCodeBlock>,
          table: ({ children }) => <div className="chat-table-wrap"><table>{children}</table></div>,
        }}
      >
        {content}
      </Markdown>
      {streaming && <span className="stream-cursor" aria-hidden="true" />}
    </div>
  )
}

function ChatCodeBlock({ children }: { children?: ReactNode }) {
  const code = isValidElement<{ children?: ReactNode; className?: string }>(children) ? children : undefined
  const content = String(code?.props.children ?? "").replace(/\n$/, "")
  const highlightedContent = highlightChatCode(content, code?.props.className)
  const codeContent = highlightedContent
    ? <code className={code?.props.className} dangerouslySetInnerHTML={{ __html: highlightedContent }} />
    : <code className={code?.props.className}>{content}</code>

  return (
    <div className="chat-code-block">
      <CopyCodeButton content={content} />
      <pre>{codeContent}</pre>
    </div>
  )
}

function CopyCodeButton({ content }: { content: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1_500)
  }

  return (
    <IconButton className="chat-code-copy" type="button" label={copied ? "Código copiado" : "Copiar código"} onClick={handleCopy}>
      {copied ? <CheckIcon aria-hidden="true" /> : <ClipboardDocumentIcon aria-hidden="true" />}
    </IconButton>
  )
}
