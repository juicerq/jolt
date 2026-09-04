import { ArrowUpIcon, PaperClipIcon, StopIcon, XMarkIcon } from "@heroicons/react/24/outline"
import { useQuery } from "@tanstack/react-query"
import { useSelector } from "@tanstack/react-store"
import { type ChangeEvent, type DragEvent, type FormEvent, type KeyboardEvent, useId, useRef, useState } from "react"
import type { Bot } from "@src/shared/bots"
import type { MessageImage } from "@src/shared/conversations"
import type { EngineClient } from "../engine-client"
import { IconButton } from "../ui/icon-button"
import { menuCardClassName } from "../ui/menu"

export const promptWidthClassName = "mx-auto w-[min(680px,calc(100%-48px))] max-[700px]:w-[calc(100%-28px)]"
import { ChatCommandMenu, type ChatMenuChoice, useChatCommands } from "./chat-command-menu"
import { type ChatCommand, chatCommandPlaceholders, type ChatCommandName, type ChatCommandSuggestion } from "./chat-commands"
import { messageImageAccept, messageImageSource, readMessageImages } from "./chat-images"
import { ChatEditor } from "./chat-editor"
import { applyChatMention, type ChatMentionSuggestion, mentionCandidates, suggestChatMentions } from "./chat-mentions"
import { ChatModelEffort } from "./chat-model-effort"
import { ChatPermission } from "./chat-permission"
import { addChatDraftImages, addChatDraftMention, type ChatDraft, chatStore, emptyChatDraft, removeChatDraftImage, setChatDraftCommand, setChatDraftContent } from "./chat-store"

interface ChatComposerProps {
  bot: Bot
  client: EngineClient
  onAbort: () => void
  onSend: (draft: ChatDraft, deliver: "queue" | "now") => void
}

function menuChoices(commands: ChatCommandSuggestion[], mentions: ChatMentionSuggestion[]): ChatMenuChoice[] {
  if (commands.length > 0) {
    return commands.map((suggestion) => ({ key: suggestion.command, label: suggestion.command, detail: suggestion.detail }))
  }

  return mentions.map((mention) => ({ key: mention.botId, label: mention.name, detail: mention.detail, avatar: mention.avatarSeed }))
}

function ChatComposerActions({ command, working, aborting, pending, blocked, empty, onAbort, onSend }: { command: ChatCommand | null; working: boolean; aborting: boolean; pending: boolean; blocked: boolean; empty: boolean; onAbort: () => void; onSend: (immediate: boolean) => Promise<void> }) {
  return (
    <div className="col-start-5 flex items-center gap-2">
      {working && (empty || blocked)
        ? <IconButton iconSize={14} shape="circle" size={34} tone="danger" type="button" disabled={aborting} label={abortLabel({ aborting, blocked })} tooltipPlacement="top" onClick={onAbort}><StopIcon aria-hidden="true" /></IconButton>
        : <IconButton className="active:scale-96 [&>svg]:stroke-2" shape="circle" size={34} tone="primary" type="button" disabled={empty || pending || blocked} label={sendLabel({ command, pending, working, blocked })} tooltipPlacement="top" onClick={(event) => void onSend(event.ctrlKey || event.metaKey)}><ArrowUpIcon aria-hidden="true" /></IconButton>}
    </div>
  )
}

export function ChatComposer({ bot, client, onAbort, onSend }: ChatComposerProps) {
  const draft = useSelector(chatStore, (state) => state.drafts[bot.id] ?? emptyChatDraft)
  const run = useSelector(chatStore, (state) => state.runs[bot.id])
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const menuId = `commands-${useId().replace(/[^a-zA-Z0-9-]/g, "")}`
  const [highlighted, setHighlighted] = useState(0)
  const [dismissedContent, setDismissedContent] = useState<string | null>(null)
  const { suggestions, command, start: startCommand, run: runCommand, reset: resetCommand, pending: commandPending, error: commandError } = useChatCommands(bot, client, draft)
  const { data: groups } = useQuery(client.query.projects.list.queryOptions())
  const mentions = draft.command ? [] : suggestChatMentions(draft.content, mentionCandidates(groups, bot))
  const commands = run ? [] : suggestions
  const choices = menuChoices(commands, mentions)
  const menuOpen = choices.length > 0 && draft.content !== dismissedContent
  const active = Math.min(highlighted, choices.length - 1)
  const empty = !command && draft.content.trim().length === 0 && draft.images.length === 0
  const commandBlocked = !!draft.command && !!run
  const busy = commandPending
  const settingsDisabled = !!run || commandPending
  const aborting = run?.status === "aborting"

  async function attachFiles(files: Iterable<File>) {
    const images = await readMessageImages(files)

    if (images.length === 0) {
      return
    }

    addChatDraftImages(bot.id, images)
  }

  async function handleSend(immediate: boolean) {
    if (empty || busy || commandBlocked) {
      return
    }

    if (command) {
      const ran = await runCommand(command).then(() => true).catch(() => false)

      if (ran) {
        setChatDraftCommand(bot.id, undefined, "")
      }

      return
    }

    onSend(draft, immediate ? "now" : "queue")
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void handleSend(false)
  }

  function handleChange(content: string) {
    resetCommand()
    setHighlighted(0)

    const started = startCommand(content)

    if (started) {
      setChatDraftCommand(bot.id, started.command, started.content)

      return
    }

    setChatDraftContent(bot.id, content)
  }

  function pickChoice(index: number) {
    const suggestion = commands[index]

    if (suggestion) {
      setChatDraftCommand(bot.id, suggestion.command, "")

      return
    }

    const mention = mentions[index]

    if (mention) {
      addChatDraftMention(bot.id, applyChatMention(draft.content, mention), { botId: mention.botId, name: mention.name, avatarSeed: mention.avatarSeed })
    }
  }

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
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

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>, atStart: boolean) {
    if (event.nativeEvent.isComposing) {
      return
    }

    if (menuOpen) {
      handleMenuKeyDown(event)

      return
    }

    if (draft.command && event.key === "Backspace" && atStart) {
      event.preventDefault()
      setChatDraftCommand(bot.id, undefined, draft.content)

      return
    }

    if (event.key === "Escape" && run) {
      event.preventDefault()
      onAbort()

      return
    }

    if (event.key !== "Enter" || event.shiftKey) {
      return
    }

    event.preventDefault()
    void handleSend(event.ctrlKey || event.metaKey)
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
      className={`${promptWidthClassName} relative grid box-border grid-cols-[auto_auto_auto_minmax(0,1fr)_auto] items-center gap-x-2 border border-outline-strong bg-surface-raised px-2 py-[7px] shadow-[0_14px_32px_rgb(0_0_0_/_24%)] gap-y-1 rounded-[18px] focus-within:border-muted`}
      onSubmit={handleSubmit}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {menuOpen && <ChatCommandMenu id={menuId} label={commands.length > 0 ? "Comandos" : "Bots"} choices={choices} highlighted={active} onHighlight={setHighlighted} onPick={pickChoice} />}
      {!menuOpen && commandError && <ChatCommandStatus error={commandError} />}
      {draft.images.length > 0 && <ChatComposerImages images={draft.images} onRemove={(index) => removeChatDraftImage(bot.id, index)} />}
      <IconButton iconSize={16} shape="circle" size={34} type="button" disabled={busy} label="Anexar imagem" tooltipPlacement="top" onClick={() => fileInputRef.current?.click()}><PaperClipIcon aria-hidden="true" /></IconButton>
      <input ref={fileInputRef} className="hidden" type="file" accept={messageImageAccept} multiple tabIndex={-1} onChange={handleFileChange} />
      <div className="order-first col-span-full flex min-w-0 items-start gap-1.5">
        {draft.command && <ChatComposerCommand command={draft.command} disabled={busy} onRemove={() => setChatDraftCommand(bot.id, undefined, draft.content)} />}
        <ChatEditor
          id={`prompt-${bot.id}`}
          content={draft.content}
          mentions={draft.mentions}
          placeholder={draft.command ? chatCommandPlaceholders[draft.command] : `Converse com ${bot.name}...`}
          label={draft.command ? `Texto do Comando ${draft.command}` : `Mensagem para ${bot.name}`}
          disabled={busy}
          menuOpen={menuOpen}
          menuId={menuId}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onPasteFiles={(files) => void attachFiles(files)}
        />
      </div>
      <ChatModelEffort bot={bot} client={client} disabled={settingsDisabled} />
      <ChatPermission bot={bot} client={client} disabled={settingsDisabled} />
      <ChatComposerActions command={command} working={!!run} aborting={aborting} pending={commandPending} blocked={commandBlocked} empty={empty} onAbort={onAbort} onSend={handleSend} />
    </form>
  )
}

function abortLabel({ aborting, blocked }: { aborting: boolean; blocked: boolean }) {
  if (aborting) {
    return "Interrompendo resposta"
  }

  if (blocked) {
    return "Interromper resposta · remova o Comando para enfileirar"
  }

  return "Interromper resposta · escreva para enfileirar"
}

function sendLabel({ command, pending, working, blocked }: { command: ChatCommand | null; pending: boolean; working: boolean; blocked: boolean }) {
  if (pending) {
    return "Executando Comando"
  }

  if (blocked) {
    return "Remova o Comando para falar enquanto o Bot trabalha"
  }

  if (command) {
    return `Executar o Comando ${command.command}`
  }

  if (working) {
    return "Enfileirar mensagem · Ctrl+Enter adianta · Esc interrompe"
  }

  return "Enviar mensagem"
}

function ChatComposerCommand({ command, disabled, onRemove }: { command: ChatCommandName; disabled: boolean; onRemove: () => void }) {
  return (
    <button
      className="flex h-[25px] shrink-0 items-center gap-1 rounded-md border border-outline-strong bg-surface-hover px-2 text-metadata font-medium text-secondary transition-colors duration-150 hover:bg-surface-active hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-default disabled:opacity-40 motion-reduce:transition-none [&>svg]:size-3 [&>svg]:stroke-2"
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

function ChatCommandStatus({ error }: { error: Error }) {
  return <div className={`${menuCardClassName} absolute bottom-full left-0 mb-2 max-w-full px-3 py-2 text-support text-status-error`} role="alert" aria-live="polite">Falha ao executar o Comando: {error.message}</div>
}

function ChatComposerImages({ images, onRemove }: { images: MessageImage[]; onRemove: (index: number) => void }) {
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
