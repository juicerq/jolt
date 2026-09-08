import { ArrowUpIcon, ChevronUpIcon, PhotoIcon, QueueListIcon, XMarkIcon } from "@heroicons/react/24/outline"
import { useMutation } from "@tanstack/react-query"
import { useSelector } from "@tanstack/react-store"
import { useState } from "react"
import type { Bot } from "@src/shared/bots"
import type { QueuedMessage } from "@src/shared/conversations"
import { connectionStore } from "../connection"
import type { EngineClient } from "../engine-client"
import { Button } from "../ui/button"
import { Dialog, DialogBody } from "../ui/dialog"
import { IconButton } from "../ui/icon-button"
import { useIsMobile } from "../ui/use-is-mobile"
import { promptWidthClassName } from "./chat-composer"
import { ChatImage } from "./chat-images"
import { chatStore } from "./chat-store"

interface QueueActions {
  busy: boolean
  promotingId?: string
  removingId?: string
  onPromote: (message: QueuedMessage) => void
  onRemove: (message: QueuedMessage) => void
}

export function ChatQueue({ bot, client }: { bot: Bot; client: EngineClient }) {
  const mobile = useIsMobile()
  const connected = useSelector(connectionStore, (state) => state.connected)
  const queued = useSelector(chatStore, (state) => state.queued[bot.id])
  const awaitingDecision = useSelector(chatStore, (state) => (state.runs[bot.id]?.permissionRequests.length ?? 0) + (state.runs[bot.id]?.pluginRequests.length ?? 0) > 0)
  const working = useSelector(chatStore, (state) => state.runs[bot.id]?.status === "running")
  const [open, setOpen] = useState(false)
  const [feedback, setFeedback] = useState<{ error: boolean; message: string } | null>(null)
  const { mutateAsync: promote, isPending: promoting, variables: promoteInput } = useMutation(client.query.conversations.promote.mutationOptions())
  const { mutateAsync: unqueue, isPending: removing, variables: removeInput } = useMutation(client.query.conversations.unqueue.mutationOptions())
  const messages = queued ?? []
  const count = messages.length
  const timing = queueTiming({ connected, awaitingDecision, working })

  function openQueue() {
    setFeedback(null)
    setOpen(true)
  }

  async function act(message: QueuedMessage, action: "promote" | "remove") {
    setFeedback(null)
    const operation = action === "promote" ? promote : unqueue
    const accepted = await operation({ botId: bot.id, id: message.id }).then(() => true).catch(() => false)

    if (!accepted) {
      setFeedback({ error: true, message: "Não foi possível alterar a Fila. Tente novamente." })
      return
    }

    setFeedback({ error: false, message: action === "promote" ? "Mensagem adiantada." : "Mensagem removida da Fila." })
  }

  const actions: QueueActions = {
    busy: [promoting, removing, !connected].some(Boolean),
    ...(promoting ? { promotingId: promoteInput.id } : {}),
    ...(removing ? { removingId: removeInput.id } : {}),
    onPromote: (message) => void act(message, "promote"),
    onRemove: (message) => void act(message, "remove"),
  }

  if (count === 0 && !open) {
    return null
  }

  return <>
    {count > 0 && <section className={`${promptWidthClassName} mb-2 overflow-hidden rounded-[18px] border border-outline bg-surface-raised`} aria-label="Fila de mensagens">
      {mobile ? <MobileQueuePreview messages={messages} timing={timing.short} onOpen={openQueue} /> : <>
        <header className="flex items-center gap-2 px-4 pt-3 pb-2"><QueueListIcon className="size-4 text-secondary" aria-hidden="true" /><h2 className="m-0 text-control font-semibold text-primary">Fila</h2><QueueCount count={count} /><span className="ml-auto text-support text-secondary">{timing.short}</span><button type="button" className="ml-2 rounded-md px-2 py-1 text-support text-secondary hover:bg-surface-hover hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" onClick={openQueue}>Abrir fila</button></header>
        <ol className="m-0 max-h-52 list-none divide-y divide-outline overflow-y-auto px-4 pb-1">{messages.map((message, index) => <QueuePreviewRow key={message.id} message={message} index={index} actions={actions} onOpen={openQueue} />)}</ol>
      </>}
      {feedback?.error && !open && <QueueFeedback feedback={feedback} />}
    </section>}
    {open && <Dialog eyebrow={bot.name} title={count > 0 ? `Fila · ${count}` : "Fila vazia"} onClose={() => setOpen(false)}><DialogBody>
      <p className="m-0 text-control text-secondary">{count > 0 ? timing.detail : "Nenhuma mensagem esperando. Você pode continuar a conversa."}</p>
      {feedback && <QueueFeedback feedback={feedback} />}
      <ol className="m-0 list-none divide-y divide-outline p-0">{messages.map((message, index) => <QueueMessage key={message.id} message={message} index={index} actions={actions} />)}</ol>
    </DialogBody></Dialog>}
  </>
}

function queueTiming({ connected, awaitingDecision, working }: { connected: boolean; awaitingDecision: boolean; working: boolean }) {
  if (!connected) {
    return { short: "Sem conexão", detail: "As mensagens continuam na Fila. Aguarde a conexão para alterar ou adiantar um envio." }
  }

  if (awaitingDecision) {
    return { short: "Aguarda sua resposta", detail: "Responda ao pedido na conversa para o Bot continuar. A Fila mantém a ordem abaixo." }
  }

  if (working) {
    return { short: "Após a resposta", detail: "O Bot recebe estas mensagens em ordem ao terminar a resposta. Enviar agora adianta uma mensagem para o trabalho atual." }
  }

  return { short: "Aguardando envio", detail: "A Fila foi preservada. Use Enviar agora para retomar o trabalho com uma destas mensagens." }
}

function queuePreview(message?: QueuedMessage) {
  const content = message?.content.trim()

  if (content) {
    return content
  }

  const count = message?.images.length ?? 0

  return `${count} ${count === 1 ? "imagem" : "imagens"}`
}

function QueueCount({ count }: { count: number }) {
  return <span className="inline-flex min-w-5 items-center justify-center rounded-md bg-surface-active px-1.5 py-0.5 text-metadata tabular-nums text-secondary">{count}</span>
}

function QueueFeedback({ feedback }: { feedback: { error: boolean; message: string } }) {
  return <p className={`m-0 px-1 py-2 text-support ${feedback.error ? "text-status-error" : "text-secondary"}`} role={feedback.error ? "alert" : "status"}>{feedback.message}</p>
}

function QueuePreviewRow({ message, index, actions, onOpen }: { message: QueuedMessage; index: number; actions: QueueActions; onOpen: () => void }) {
  const image = message.images[0]

  return <li className="flex min-w-0 items-center gap-3 py-2">
    <span className="w-4 shrink-0 text-metadata tabular-nums text-muted">{index + 1}</span>
    {image && <ChatImage className="size-10 rounded-md border border-outline object-cover" image={image} index={0} />}
    <button type="button" className="min-w-0 flex-1 rounded-md py-1 text-left text-control text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" onClick={onOpen} aria-label={`Ler mensagem ${index + 1} da Fila`}><span className="line-clamp-2 whitespace-pre-wrap break-words">{queuePreview(message)}</span>{message.images.length > 0 && message.content.trim() && <span className="mt-1 flex items-center gap-1 text-metadata text-secondary"><PhotoIcon className="size-3" aria-hidden="true" />{message.images.length}</span>}</button>
    <QueueSend message={message} actions={actions} />
    <IconButton size={28} iconSize={14} type="button" disabled={actions.busy} label={`Remover mensagem ${index + 1} da Fila`} onClick={() => actions.onRemove(message)}><XMarkIcon aria-hidden="true" /></IconButton>
  </li>
}

function QueueMessage({ message, index, actions }: { message: QueuedMessage; index: number; actions: QueueActions }) {
  const [expanded, setExpanded] = useState(false)
  const long = message.content.length > 180
  const text = long && !expanded ? `${message.content.slice(0, 180).trimEnd()}…` : message.content

  return <li className="py-5 first:pt-0 last:pb-0">
    <h3 className="m-0 mb-2 text-support font-medium text-secondary">Mensagem {index + 1}</h3>
    {text && <p className="m-0 whitespace-pre-wrap break-words text-body font-normal text-primary">{text}</p>}
    {long && <button type="button" className="mt-1 min-h-11 rounded-md text-control text-secondary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>{expanded ? "Recolher texto" : "Ler mensagem inteira"}</button>}
    {message.images.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{message.images.map((image, position) => <ChatImage key={`${position}-${image.data.length}`} className="size-16 rounded-lg border border-outline object-cover" image={image} index={position} />)}</div>}
    <div className="mt-3 flex items-center justify-between gap-3"><button type="button" className="flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-control text-secondary hover:bg-surface-hover hover:text-status-error focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50" disabled={actions.busy} aria-label={`Remover mensagem ${index + 1} da Fila`} onClick={() => actions.onRemove(message)}><XMarkIcon className="size-4" aria-hidden="true" />{actions.removingId === message.id ? "Removendo…" : "Remover"}</button><QueueSend message={message} actions={actions} /></div>
  </li>
}

function QueueSend({ message, actions }: { message: QueuedMessage; actions: QueueActions }) {
  if (message.promoted || actions.promotingId === message.id) {
    return <span className="flex min-h-9 shrink-0 items-center gap-1.5 text-support text-secondary" role="status"><ArrowUpIcon className="size-3.5" aria-hidden="true" />Adiantando…</span>
  }

  return <Button className="flex items-center gap-1.5 py-2 max-md:min-h-11" variant="secondary" type="button" disabled={actions.busy} onClick={() => actions.onPromote(message)}><ArrowUpIcon className="size-3.5 shrink-0" aria-hidden="true" />Enviar agora</Button>
}

function MobileQueuePreview({ messages, timing, onOpen }: { messages: QueuedMessage[]; timing: string; onOpen: () => void }) {
  const count = messages.length

  return <button type="button" className="flex min-h-16 w-full items-center gap-3 bg-transparent px-4 py-3 text-left transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring active:bg-surface-active" onClick={onOpen} aria-haspopup="dialog" aria-label={`Abrir Fila, ${count} ${count === 1 ? "mensagem" : "mensagens"}`}>
        <QueueListIcon className="size-5 shrink-0 text-secondary" aria-hidden="true" />
        <span className="flex min-w-0 flex-1 flex-col gap-1"><span className="flex items-center gap-2"><strong className="text-control font-semibold text-primary">Fila</strong><QueueCount count={count} /><span className="ml-auto truncate text-metadata text-secondary">{timing}</span></span><span className="truncate text-support text-secondary">{queuePreview(messages[0])}</span></span>
        <ChevronUpIcon className="size-4 shrink-0 text-secondary" aria-hidden="true" />
      </button>
}
