import { memo, useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react"
import { ChatMentionChip } from "./chat-mention-chip"
import { type ChatMention, splitChatMentions } from "./chat-mentions"

type ChatEditorProps = {
  id: string
  content: string
  mentions: ChatMention[]
  placeholder: string
  label: string
  disabled: boolean
  menuOpen: boolean
  menuId: string
  onChange(content: string): void
  onKeyDown(event: KeyboardEvent<HTMLDivElement>, atStart: boolean): void
  onPasteFiles(files: FileList): void
}

const editorClassName = "relative box-border max-h-40 min-w-0 flex-1 overflow-y-auto rounded-lg px-1 text-body text-primary focus-visible:outline-none min-h-[25px] py-0 whitespace-pre-wrap [overflow-wrap:anywhere] data-[disabled=true]:opacity-60 data-[empty=true]:before:pointer-events-none data-[empty=true]:before:absolute data-[empty=true]:before:text-muted data-[empty=true]:before:content-[attr(data-placeholder)]"

function readNode(node: ChildNode): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.nodeValue ?? ""
  }

  if (!(node instanceof HTMLElement)) {
    return ""
  }

  if (node.dataset.mention) {
    return node.dataset.mention
  }

  if (node.tagName === "BR") {
    return "\n"
  }

  const inner = [...node.childNodes].map(readNode).join("")

  return node.tagName === "DIV" || node.tagName === "P" ? `\n${inner}` : inner
}

function readEditor(node: HTMLElement) {
  const children = [...node.childNodes]
  const last = children.at(-1)
  const written = last instanceof HTMLElement && last.tagName === "BR" ? children.slice(0, -1) : children

  return written.map(readNode).join("")
}

function caretToEnd(node: HTMLElement) {
  const selection = window.getSelection()
  const range = document.createRange()

  range.selectNodeContents(node)
  range.collapse(false)
  selection?.removeAllRanges()
  selection?.addRange(range)
}

function caretAtStart(node: HTMLElement) {
  const selection = window.getSelection()

  if (!selection?.isCollapsed || selection.rangeCount === 0) {
    return false
  }

  const caret = selection.getRangeAt(0)
  const before = document.createRange()

  before.selectNodeContents(node)
  before.setEnd(caret.startContainer, caret.startOffset)

  return before.toString().length === 0
}

const ChatEditorContent = memo(
  ({ content, mentions }: { revision: number; content: string; mentions: ChatMention[] }) => (
    <>
      {splitChatMentions(content, mentions).map((segment, index) => (segment.mention
        ? <span key={`${index}-${segment.text}`} className="inline-block align-middle" contentEditable={false} data-mention={segment.text}><ChatMentionChip mention={segment.mention} /></span>
        : segment.text))}
    </>
  ),
  (before, after) => before.revision === after.revision,
)

export function ChatEditor({ id, content, mentions, placeholder, label, disabled, menuOpen, menuId, onChange, onKeyDown, onPasteFiles }: ChatEditorProps) {
  const ref = useRef<HTMLDivElement | null>(null)
  const typed = useRef(content)
  const [revision, setRevision] = useState(0)

  if (content !== typed.current) {
    typed.current = content
    setRevision((current) => current + 1)
  }

  useEffect(() => {
    const node = ref.current
    const loose = !document.activeElement || document.activeElement === document.body

    if (revision > 0 && node && (loose || node.contains(document.activeElement))) {
      node.focus()
      caretToEnd(node)
    }
  }, [revision])

  function handleInput() {
    const node = ref.current

    if (!node) {
      return
    }

    typed.current = readEditor(node)
    onChange(typed.current)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" && event.shiftKey) {
      event.preventDefault()
      document.execCommand("insertLineBreak")
      handleInput()

      return
    }

    onKeyDown(event, ref.current ? caretAtStart(ref.current) : false)
  }

  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    event.preventDefault()

    if (event.clipboardData.files.length > 0) {
      onPasteFiles(event.clipboardData.files)

      return
    }

    document.execCommand("insertText", false, event.clipboardData.getData("text/plain"))
    handleInput()
  }

  return (
    <div
      key={revision}
      ref={ref}
      className={editorClassName}
      id={id}
      contentEditable={!disabled}
      suppressContentEditableWarning
      role="combobox"
      aria-label={label}
      aria-multiline="true"
      aria-expanded={menuOpen}
      aria-controls={menuOpen ? menuId : undefined}
      aria-autocomplete="list"
      data-placeholder={placeholder}
      data-empty={content.length === 0}
      data-disabled={disabled}
      onInput={handleInput}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
    >
      <ChatEditorContent revision={revision} content={content} mentions={mentions} />
    </div>
  )
}
