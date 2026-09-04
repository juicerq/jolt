import { BoltIcon, PhotoIcon, XMarkIcon } from "@heroicons/react/24/outline"
import { useMutation } from "@tanstack/react-query"
import { useSelector } from "@tanstack/react-store"
import type { Bot } from "@src/shared/bots"
import type { QueuedMessage } from "@src/shared/conversations"
import type { EngineClient } from "../engine-client"
import { IconButton } from "../ui/icon-button"
import { MenuLabel, menuSurfaceClassName } from "../ui/menu"
import { promptWidthClassName } from "./chat-composer"
import { chatStore } from "./chat-store"

export function ChatQueue({ bot, client }: { bot: Bot; client: EngineClient }) {
  const queued = useSelector(chatStore, (state) => state.queued[bot.id])
  const awaitingDecision = useSelector(chatStore, (state) => (state.runs[bot.id]?.permissionRequests.length ?? 0) + (state.runs[bot.id]?.pluginRequests.length ?? 0) > 0)
  const { mutateAsync: promote, isPending: promoting } = useMutation(client.query.conversations.promote.mutationOptions())
  const { mutateAsync: unqueue, isPending: removing } = useMutation(client.query.conversations.unqueue.mutationOptions())

  if (!queued) {
    return null
  }

  return (
    <div className={`${menuSurfaceClassName} ${promptWidthClassName} mb-2 max-h-52 overflow-y-auto`} aria-label="Fila de mensagens">
      <MenuLabel>{queued.length === 1 ? "1 mensagem na fila" : `${queued.length} mensagens na fila`}</MenuLabel>
      <ul className="m-0 list-none p-0">
        {queued.map((message) => (
          <ChatQueueRow
            key={message.id}
            message={message}
            busy={promoting || removing}
            onPromote={() => void promote({ botId: bot.id, id: message.id }).catch(reportQueueError)}
            onRemove={() => void unqueue({ botId: bot.id, id: message.id }).catch(reportQueueError)}
          />
        ))}
      </ul>
      {awaitingDecision && <p className="m-0 px-2 pt-1 pb-1 text-support text-muted" role="status">A entrega espera a sua decisão acima.</p>}
    </div>
  )
}

function reportQueueError(error: unknown) {
  console.error("A Fila não aceitou a ação", error)
}

function ChatQueueRow({ message, busy, onPromote, onRemove }: { message: QueuedMessage; busy: boolean; onPromote(): void; onRemove(): void }) {
  const preview = message.content.trim()

  return (
    <li className="group mb-px flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 transition-colors duration-150 last:mb-0 hover:bg-surface-hover motion-reduce:transition-none">
      {message.images.length > 0 && (
        <span className="flex shrink-0 items-center gap-0.5 text-metadata text-muted" aria-label={message.images.length === 1 ? "1 imagem" : `${message.images.length} imagens`}>
          <PhotoIcon className="size-3.5" aria-hidden="true" />
          {message.images.length}
        </span>
      )}
      <span className={`min-w-0 flex-1 truncate text-control ${preview ? "text-secondary" : "text-muted"}`} title={preview}>{preview || "Sem texto"}</span>
      {message.promoted
        ? <span className="shrink-0 text-metadata text-muted">Adiantando…</span>
        : <IconButton className="shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100" iconSize={13} size={24} type="button" disabled={busy} label="Enviar agora" tooltipPlacement="top" onClick={onPromote}><BoltIcon aria-hidden="true" /></IconButton>}
      <IconButton className="shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100" iconSize={13} size={24} type="button" disabled={busy} label="Remover da fila" tooltipPlacement="top" onClick={onRemove}><XMarkIcon aria-hidden="true" /></IconButton>
    </li>
  )
}
