import { CheckIcon, ClipboardDocumentIcon } from "@heroicons/react/24/outline"
import { isValidElement, type ReactNode, useState } from "react"
import { IconButton } from "../ui/icon-button"
import { highlightChatCode } from "./chat-code-highlight"
import { createMarkdownRenderer } from "./chat-markdown"

const markdown = createMarkdownRenderer({
  cacheBytes: 4_000_000,
  components: {
    a: ({ children, ...props }) => <a className="text-primary underline decoration-outline-strong underline-offset-3 hover:decoration-primary" {...props} target="_blank" rel="noreferrer">{children}</a>,
    blockquote: ({ children }) => <blockquote className="my-4 border-l-2 border-outline-strong pl-4 text-secondary">{children}</blockquote>,
    code: ({ children, className }) => <code className={`${className ?? ""} font-mono text-[0.88em] font-semibold text-inline-code`}>{children}</code>,
    h1: ({ children }) => <h1 className="mt-6 mb-2 text-title font-semibold leading-[1.35] text-primary">{children}</h1>,
    h2: ({ children }) => <h2 className="mt-6 mb-2 text-[17px] font-semibold leading-[1.35] text-primary">{children}</h2>,
    h3: ({ children }) => <h3 className="mt-6 mb-2 text-section font-semibold leading-[1.35] text-primary">{children}</h3>,
    h4: ({ children }) => <h4 className="mt-6 mb-2 text-section font-semibold leading-[1.35] text-primary">{children}</h4>,
    hr: () => <hr className="my-6 h-px border-0 bg-outline" />,
    li: ({ children }) => <li className="my-1 p-0 marker:text-muted">{children}</li>,
    ol: ({ children, start }) => <ol start={start} className="my-2 mb-4 list-decimal pl-6">{children}</ol>,
    p: ({ children }) => <p className="mt-0 mb-3 whitespace-normal">{children}</p>,
    pre: ({ children }) => <ChatCodeBlock>{children}</ChatCodeBlock>,
    table: ({ children }) => <div className="my-4 max-w-full overflow-x-auto rounded-xl border border-outline"><table className="w-full border-collapse text-control">{children}</table></div>,
    td: ({ children }) => <td className="border-b border-outline px-3 py-[9px] text-left whitespace-nowrap [tr:last-child_&]:border-b-0">{children}</td>,
    th: ({ children }) => <th className="border-b border-outline bg-surface-raised px-3 py-[9px] text-left font-semibold whitespace-nowrap text-secondary">{children}</th>,
    ul: ({ children }) => <ul className="my-2 mb-4 list-disc pl-6">{children}</ul>,
  },
})

export function ChatContent({ content, streaming = false }: { content: string; streaming?: boolean }) {
  return <div className="min-w-0 text-body text-primary [overflow-wrap:anywhere] [&>:first-child]:mt-0 [&>:last-child]:mb-0">{streaming ? markdown.renderStreaming(content) : markdown.render(content)}</div>
}

function ChatCodeBlock({ children }: { children?: ReactNode }) {
  const code = isValidElement<{ children?: ReactNode; className?: string }>(children) ? children : undefined
  const content = String(code?.props.children ?? "").replace(/\n$/, "")
  const highlightedContent = highlightChatCode(content, code?.props.className)
  const codeContent = highlightedContent
    ? <code className={code?.props.className} dangerouslySetInnerHTML={{ __html: highlightedContent }} />
    : <code className={code?.props.className}>{content}</code>

  return (
    <div className="chat-code relative my-4 rounded-xl border border-outline bg-canvas">
      <CopyCodeButton content={content} />
      <pre className="m-0 overflow-x-auto rounded-[inherit] py-4 pr-12 pl-4">{codeContent}</pre>
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
    <IconButton className="top-2 right-2 z-1" iconSize={14} position="absolute" size={28} tone="canvas" type="button" label={copied ? "Código copiado" : "Copiar código"} onClick={handleCopy}>
      {copied ? <CheckIcon aria-hidden="true" /> : <ClipboardDocumentIcon aria-hidden="true" />}
    </IconButton>
  )
}

export const chatChipClassName = "relative isolate grid w-fit cursor-pointer list-none grid-cols-[16px_auto_14px] items-center gap-[7px] before:absolute before:-inset-x-[7px] before:-inset-y-[5px] before:-z-10 before:rounded-lg hover:text-secondary hover:before:bg-surface-hover focus-visible:text-secondary focus-visible:outline-none focus-visible:before:bg-surface-hover [&::-webkit-details-marker]:hidden [&_svg]:stroke-[1.75]"

export const chatGuideClassName = "relative before:pointer-events-none before:absolute before:inset-y-0 before:left-0 before:w-2.5 before:rounded-bl before:border-b before:border-l before:border-outline"
