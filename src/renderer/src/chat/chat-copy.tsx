import { CheckIcon, ClipboardDocumentIcon } from "@heroicons/react/24/outline"
import { type MouseEvent, useState } from "react"
import { blurMouseClick } from "../ui/blur-mouse-click"
import { IconButton } from "../ui/icon-button"

export function ChatCopyButton({ className, content, label, copiedLabel }: { className: string; content: string; label: string; copiedLabel: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy(event: MouseEvent<HTMLButtonElement>) {
    blurMouseClick(event)
    await navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1_500)
  }

  return (
    <IconButton className={className} iconSize={14} position="absolute" size={28} tone="canvas" type="button" label={copied ? copiedLabel : label} onClick={handleCopy}>
      {copied ? <CheckIcon aria-hidden="true" /> : <ClipboardDocumentIcon aria-hidden="true" />}
    </IconButton>
  )
}
