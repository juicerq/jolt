import { ArrowUpIcon, PaperClipIcon, StopIcon, XMarkIcon } from "@heroicons/react/24/outline"
import { useQuery } from "@tanstack/react-query"
import { useSelector } from "@tanstack/react-store"
import { type ChangeEvent, type ClipboardEvent, type DragEvent, type FormEvent, type KeyboardEvent, useId, useRef, useState } from "react"
import type { Bot } from "../../../shared/bots"
import type { MessageImage } from "../../../shared/conversations"
import { botAvatarName } from "../bots/bot-avatar"
import type { EngineClient } from "../engine-client"
import { IconButton } from "../ui/icon-button"
import { menuCardClassName } from "../ui/menu"
import { ChatCommandMenu, type ChatMenuChoice, useChatCommands } from "./chat-command-menu"
import { type ChatCommand, chatCommandPlaceholders, type ChatCommandName } from "./chat-commands"
import { messageImageAccept, messageImageSource, readMessageImages } from "./chat-images"
import { applyChatMention, mentionCandidates, suggestChatMentions } from "./chat-mentions"
import { ChatModelEffort } from "./chat-model-effort"
import { ChatPermission } from "./chat-permission"
import { ChatPluginRequest } from "./chat-plugin-request"
import { addChatDraftImages, addChatDraftMention, type ChatDraft, chatStore, emptyChatDraft, removeChatDraftImage, setChatDraftCommand, setChatDraftContent } from "./chat-store"

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
  const menuId = `commands-${useId().replace(/[^a-zA-Z0-9-]/g, "")}`
  const [highlighted, setHighlighted] = useState(0)
  const [dismissedContent, setDismissedContent] = useState<string | null>(null)
  const { suggestions, command, start: startCommand, run: runCommand, reset: resetCommand, pending: commandPending, error: commandError, compacted, compacting } = useChatCommands(bot, client, draft)
  const { data: groups } = useQuery(client.query.projects.list.queryOptions())
  const mentions = draft.command ? [] : suggestChatMentions(draft.content, mentionCandidates(groups, bot))
  const choices: ChatMenuChoice[] = suggestions.length > 0
    ? suggestions.map((suggestion) => ({ key: suggestion.command, label: suggestion.command, detail: suggestion.detail }))
    : mentions.map((mention) => ({ key: mention.botId, label: mention.name, detail: mention.detail, avatar: botAvatarName({ id: mention.botId, name: mention.name }) }))
  const menuOpen = choices.length > 0 && draft.content !== dismissedContent && !run
  const active = Math.min(highlighted, choices.length - 1)
  const empty = !command && draft.content.trim().length === 0 && draft.images.length === 0
  const busy = !!run || commandPending
  const aborting = run?.status === "aborting"
  const pluginRequest = run?.pluginRequests[0]

  async function attachFiles(files: Iterable<File>) {
    const images = await readMessageImages(files)

    if (images.length === 0) {
      return
    }

    addChatDraftImages(bot.id, images)
  }

  async function handleSend() {
    if (empty || busy) {
      return
    }

    if (command) {
      const ran = await runCommand(command).then(() => true).catch(() => false)

      if (ran) {
        setChatDraftCommand(bot.id, undefined, "")
      }

      return
    }

    onSend(draft)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void handleSend()
  }

  function handleChange(event: ChangeEvent<HTMLTextAreaElement>) {
    resetCommand()
    setHighlighted(0)

    const started = startCommand(event.target.value)

    if (started) {
      setChatDraftCommand(bot.id, started.command, started.content)

      return
    }

    setChatDraftContent(bot.id, event.target.value)
  }

  function pickChoice(index: number) {
    const suggestion = suggestions[index]

    if (suggestion) {
      setChatDraftCommand(bot.id, suggestion.command, "")

      return
    }

    const mention = mentions[index]

    if (mention) {
      addChatDraftMention(bot.id, applyChatMention(draft.content, mention), { botId: mention.botId, name: mention.name })
    }
  }

  function handleMenuKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setHighlighted((active + 1) % choices.length)

      return
    }

    if (event.key === "ArrowUp") {
      event.preventDefault()
      setHighlighted((active - 1 + choices.length) % choices.length)

      return
    }

    if (event.key === "Escape") {
      event.preventDefault()
      setDismissedContent(draft.content)

      return
    }

    if (event.key === "Tab" || (event.key === "Enter" && !event.shiftKey)) {
      event.preventDefault()
      pickChoice(active)
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.nativeEvent.isComposing) {
      return
    }

    if (menuOpen) {
      handleMenuKeyDown(event)

      return
    }

    const atStart = event.currentTarget.selectionStart === 0 && event.currentTarget.selectionEnd === 0

    if (draft.command && event.key === "Backspace" && atStart) {
      event.preventDefault()
      setChatDraftCommand(bot.id, undefined, draft.content)

      return
    }

    if (event.key !== "Enter" || event.shiftKey) {
      return
    }

    event.preventDefault()
    void handleSend()
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    if (event.clipboardData.files.length === 0) {
      return
    }

    event.preventDefault()
    void attachFiles(event.clipboardData.files)
  }

  function handleDragOver(event: DragEvent<HTMLFormElement>) {
    event.preventDefault()
  }

  function handleDrop(event: DragEvent<HTMLFormElement>) {
    event.preventDefault()

    if (busy) {
      return
    }

    void attachFiles(event.dataTransfer.files)
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    void attachFiles(event.target.files ?? [])
    event.target.value = ""
  }

  return (
    <form
      className="relative z-[1] col-start-1 row-start-1 mb-[22px] grid w-[min(680px,calc(100%-48px))] box-border grid-cols-[auto_auto_auto_minmax(0,1fr)_auto] items-center gap-x-2 self-end justify-self-center border border-outline-strong bg-surface-raised px-2 py-[7px] shadow-[0_14px_32px_rgb(0_0_0_/_24%)] gap-y-1 rounded-[18px] focus-within:border-muted max-[700px]:w-[calc(100%-28px)]"
      onSubmit={handleSubmit}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {menuOpen && <ChatCommandMenu id={menuId} label={suggestions.length > 0 ? "Comandos" : "Bots"} choices={choices} highlighted={active} onHighlight={setHighlighted} onPick={pickChoice} />}
      {!menuOpen && (compacting || compacted || commandError) && <ChatCommandStatus compacting={compacting} compacted={compacted} error={commandError} />}
      {pluginRequest && <ChatPluginRequest botId={bot.id} client={client} request={pluginRequest} />}
      {draft.images.length > 0 && <ChatComposerImages images={draft.images} onRemove={(index) => removeChatDraftImage(bot.id, index)} />}
      <IconButton iconSize={16} shape="circle" size={34} type="button" disabled={busy} label="Anexar imagem" tooltipPlacement="top" onClick={() => fileInputRef.current?.click()}><PaperClipIcon aria-hidden="true" /></IconButton>
      <input ref={fileInputRef} className="hidden" type="file" accept={messageImageAccept} multiple tabIndex={-1} onChange={handleFileChange} />
      <label className="sr-only" htmlFor={`prompt-${bot.id}`}>{draft.command ? `Texto do Comando ${draft.command}` : `Mensagem para ${bot.name}`}</label>
      <div className="order-first col-span-full flex min-w-0 items-start gap-1.5">
        {draft.command && <ChatComposerCommand command={draft.command} disabled={busy} onRemove={() => setChatDraftCommand(bot.id, undefined, draft.content)} />}
        <textarea
          className="field-sizing-content box-border max-h-40 min-w-0 flex-1 resize-none overflow-y-auto rounded-lg border-0 bg-transparent px-1 text-body text-primary placeholder:text-muted disabled:opacity-60 focus-visible:outline-none min-h-[25px] py-0"
          id={`prompt-${bot.id}`}
          placeholder={draft.command ? chatCommandPlaceholders[draft.command] : `Converse com ${bot.name}...`}
          value={draft.content}
          rows={1}
          disabled={busy}
          role="combobox"
          aria-expanded={menuOpen}
          aria-controls={menuOpen ? menuId : undefined}
          aria-autocomplete="list"
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
        />
      </div>
      <ChatModelEffort bot={bot} client={client} disabled={busy} />
      <ChatPermission bot={bot} client={client} disabled={busy} />
      {run
        ? <IconButton className="col-start-5" iconSize={14} shape="circle" size={34} tone="danger" type="button" disabled={aborting} label={aborting ? "Interrompendo resposta" : "Interromper resposta"} tooltipPlacement="top" onClick={onAbort}><StopIcon aria-hidden="true" /></IconButton>
        : <IconButton className="col-start-5 active:scale-96 [&>svg]:stroke-2" shape="circle" size={34} tone="primary" type="submit" disabled={empty || commandPending} label={sendLabel(command, commandPending)} tooltipPlacement="top"><ArrowUpIcon aria-hidden="true" /></IconButton>}
    </form>
  )
}

function sendLabel(command: ChatCommand | null, pending: boolean) {
  if (pending) {
    return "Executando Comando"
  }

  if (command) {
    return `Executar o Comando ${command.command}`
  }

  return "Enviar mensagem"
}

function ChatComposerCommand({ command, disabled, onRemove }: { command: ChatCommandName; disabled: boolean; onRemove(): void }) {
  return (
    <button
      className="flex h-[25px] shrink-0 items-center gap-1 rounded-md border-0 bg-surface-hover px-2 text-metadata font-medium text-secondary transition-colors duration-150 hover:bg-surface-active hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-default disabled:opacity-40 motion-reduce:transition-none [&>svg]:size-3 [&>svg]:stroke-2"
      type="button"
      disabled={disabled}
      aria-label={`Remover o Comando ${command}`}
      onClick={onRemove}
    >
      <span className="first-letter:uppercase">{command}</span>
      <XMarkIcon aria-hidden="true" />
    </button>
  )
}

const tokenFormat = new Intl.NumberFormat("pt-BR")

function ChatCommandStatus({ compacting, compacted, error }: { compacting: boolean; compacted?: { tokensBefore: number; estimatedTokensAfter?: number }; error: Error | null }) {
  let content = "Compactando Contexto..."
  let tone = "text-muted"

  if (error) {
    content = `Falha ao executar o Comando: ${error.message}`
    tone = "text-status-error"
  } else if (compacted?.estimatedTokensAfter === undefined && compacted) {
    content = `Contexto compactado a partir de ${tokenFormat.format(compacted.tokensBefore)} tokens.`
    tone = "text-secondary"
  } else if (compacted) {
    content = `Contexto compactado: ${tokenFormat.format(compacted.tokensBefore)} → ~${tokenFormat.format(compacted.estimatedTokensAfter ?? 0)} tokens.`
    tone = "text-secondary"
  }

  return <div className={`${menuCardClassName} absolute bottom-full left-0 mb-2 max-w-full px-3 py-2 text-support ${tone}`} role={error ? "alert" : "status"} aria-live="polite">{compacting ? "Compactando Contexto..." : content}</div>
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
