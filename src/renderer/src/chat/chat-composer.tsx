import { ArrowUpIcon, PaperClipIcon, StopIcon, XMarkIcon } from "@heroicons/react/24/outline"
import { useSelector } from "@tanstack/react-store"
import { type ChangeEvent, type ClipboardEvent, type DragEvent, type KeyboardEvent, useRef } from "react"
import type { Bot } from "../../../shared/bots"
import type { MessageImage } from "../../../shared/conversations"
import type { EngineClient } from "../engine-client"
import { IconButton } from "../ui/icon-button"
import { messageImageAccept, messageImageSource, readMessageImages } from "./chat-images"
import { ChatModelEffort } from "./chat-model-effort"
import { addChatDraftImages, type ChatDraft, chatStore, emptyChatDraft, removeChatDraftImage, setChatDraftContent } from "./chat-store"

type ChatComposerProps = {
  bot: Bot
  client: EngineClient
  onAbort(): void
  onSend(draft: ChatDraft): void
}

export function ChatComposer({ bot, client, onAbort, onSend }: ChatComposerProps) {
  const draft = useSelector(chatStore, (state) => state.drafts[bot.id] ?? emptyChatDraft)
  const run = useSelector(chatStore, (state) => state.runs[bot.id])
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const empty = draft.content.trim().length === 0 && draft.images.length === 0
  const aborting = run?.status === "aborting"

  async function attachFiles(files: Iterable<File>) {
    const images = await readMessageImages(files)

    if (images.length === 0) {
      return
    }

    addChatDraftImages(bot.id, images)
  }

  function handleSend() {
    if (empty || run) {
      return
    }

    onSend(draft)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
      return
    }

    event.preventDefault()
    handleSend()
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    if (event.clipboardData.files.length === 0) {
      return
    }

    event.preventDefault()
    void attachFiles(event.clipboardData.files)
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()

    if (run) {
      return
    }

    void attachFiles(event.dataTransfer.files)
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    void attachFiles(event.target.files ?? [])
    event.target.value = ""
  }

  return (
    <div
      className="z-[1] col-start-1 row-start-1 mb-[22px] grid w-[min(680px,calc(100%-48px))] box-border grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-x-2 self-end justify-self-center border border-outline-strong bg-surface-raised px-2 py-[7px] shadow-[0_14px_32px_rgb(0_0_0_/_24%)] gap-y-1 rounded-[18px] focus-within:border-muted max-[700px]:w-[calc(100%-28px)]"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {draft.images.length > 0 && <ChatComposerImages images={draft.images} onRemove={(index) => removeChatDraftImage(bot.id, index)} />}
      <IconButton iconSize={16} shape="circle" size={34} type="button" disabled={!!run} label="Anexar imagem" tooltipPlacement="top" onClick={() => fileInputRef.current?.click()}><PaperClipIcon aria-hidden="true" /></IconButton>
      <input ref={fileInputRef} className="hidden" type="file" accept={messageImageAccept} multiple tabIndex={-1} onChange={handleFileChange} />
      <label className="sr-only" htmlFor={`prompt-${bot.id}`}>Mensagem para {bot.name}</label>
      <textarea
        className="field-sizing-content box-border max-h-40 resize-none overflow-y-auto rounded-lg border-0 bg-transparent px-1 text-body text-primary placeholder:text-muted disabled:opacity-60 focus-visible:outline-none order-first col-span-full min-h-[25px] py-0"
        id={`prompt-${bot.id}`}
        placeholder={`Converse com ${bot.name}...`}
        value={draft.content}
        rows={1}
        disabled={!!run}
        onChange={(event) => setChatDraftContent(bot.id, event.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
      />
      <ChatModelEffort bot={bot} client={client} disabled={!!run} />
      {run
        ? <IconButton className="col-start-4" iconSize={14} shape="circle" size={34} tone="danger" type="button" disabled={aborting} label={aborting ? "Interrompendo resposta" : "Interromper resposta"} tooltipPlacement="top" onClick={onAbort}><StopIcon aria-hidden="true" /></IconButton>
        : <IconButton className="col-start-4 active:scale-96 [&>svg]:stroke-2" shape="circle" size={34} tone="primary" type="button" disabled={empty} label="Enviar mensagem" tooltipPlacement="top" onClick={handleSend}><ArrowUpIcon aria-hidden="true" /></IconButton>}
    </div>
  )
}

function ChatComposerImages({ images, onRemove }: { images: MessageImage[]; onRemove(index: number): void }) {
  return (
    <ul className="order-first col-span-full m-0 flex list-none flex-wrap gap-2 p-1">
      {images.map((image, index) => (
        <li key={`${index}-${image.data.length}`} className="group relative">
          <img className="block size-12 rounded-lg border border-outline-strong object-cover" src={messageImageSource(image)} alt={`Imagem ${index + 1}`} />
          <IconButton className="-top-1.5 -right-1.5 opacity-0 group-hover:opacity-100 focus-visible:opacity-100" iconSize={13} position="absolute" shape="circle" size={24} tone="canvas" type="button" label="Remover imagem" tooltipPlacement="top" onClick={() => onRemove(index)}><XMarkIcon aria-hidden="true" /></IconButton>
        </li>
      ))}
    </ul>
  )
}
