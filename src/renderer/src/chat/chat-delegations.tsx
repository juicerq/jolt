import { ArrowTopRightOnSquareIcon, ChevronDownIcon } from "@heroicons/react/24/outline"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import type { Bot } from "../../../shared/bots"
import type { ConversationMessage } from "../../../shared/conversations"
import type { Task, TaskStatus } from "../../../shared/tasks"
import { selectBot } from "../bots/bots-store"
import type { EngineClient } from "../engine-client"
import { ChatContent } from "./chat-content"

const statusLabels: Record<TaskStatus, string> = {
  working: "Em andamento",
  done: "Concluída",
  interrupted: "Interrompida",
  failed: "Falhou",
}

const statusClassNames: Record<TaskStatus, string> = {
  working: "bg-status-working",
  done: "bg-status-success",
  interrupted: "bg-status-warning",
  failed: "bg-status-error",
}

export function ChatDelegations({ bot, client, names }: { bot: Bot; client: EngineClient; names: Record<string, string> }) {
  const { data: tasks } = useQuery(client.query.tasks.listForLeader.queryOptions({ input: { leaderBotId: bot.id } }))

  if (!tasks?.length) {
    return null
  }

  return (
    <section className="flex flex-col gap-2" aria-label="Delegações">
      <h2 className="m-0 text-label font-semibold uppercase tracking-[0.08em] text-muted">Delegações</h2>
      {tasks.map((task) => <DelegationCard key={task.id} client={client} names={names} task={task} />)}
    </section>
  )
}

function DelegationCard({ client, names, task }: { client: EngineClient; names: Record<string, string>; task: Task }) {
  const [expanded, setExpanded] = useState(false)
  const assigneeName = names[task.assigneeBotId] ?? "Integrante"

  return (
    <article className="rounded-xl border border-outline bg-surface-raised px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="m-0 text-body text-primary">{task.outcome}</p>
          <p className="mt-1 mb-0 flex items-center gap-2 text-support text-secondary">
            <span className={`inline-block size-2 rounded-full ${statusClassNames[task.status]}`} aria-hidden="true" />
            <span>{statusLabels[task.status]}</span>
            <span aria-hidden="true">·</span>
            <span>{assigneeName}</span>
          </p>
        </div>
        <button className="flex flex-none items-center gap-1.5 rounded-lg border border-outline-strong bg-transparent px-3 py-2 text-metadata font-medium text-secondary hover:bg-surface-hover hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" type="button" onClick={() => selectBot(task.assigneeBotId)}>
          <ArrowTopRightOnSquareIcon className="size-3.5" aria-hidden="true" />
          Abrir {assigneeName}
        </button>
      </div>
      <button className="mt-2 flex items-center gap-1 rounded-md bg-transparent p-0 text-metadata font-medium text-muted hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" type="button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
        <ChevronDownIcon className={`size-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
        Conversa da Tarefa
      </button>
      {expanded && <RelatedConversation client={client} names={names} taskId={task.id} />}
    </article>
  )
}

function RelatedConversation({ client, names, taskId }: { client: EngineClient; names: Record<string, string>; taskId: string }) {
  const { data: messages, error, isPending } = useQuery(client.query.conversations.related.queryOptions({ input: { taskId } }))

  if (error) {
    return <p className="mt-3 mb-0 text-support text-status-error">Não foi possível abrir a conversa: {error.message}</p>
  }

  if (isPending) {
    return <p className="mt-3 mb-0 text-support text-muted">Abrindo conversa...</p>
  }

  return (
    <ol className="mt-3 flex list-none flex-col gap-3 border-t border-outline p-0 pt-3">
      {messages.map((message) => <RelatedMessage key={message.id} message={message} names={names} />)}
    </ol>
  )
}

function RelatedMessage({ message, names }: { message: ConversationMessage; names: Record<string, string> }) {
  const author = message.author === "person" ? "Você" : names[message.authorBotId ?? ""] ?? "Bot"

  return (
    <li className="min-w-0">
      <p className="m-0 mb-1 flex items-center gap-2 text-metadata font-medium text-muted">
        <strong className="font-semibold text-secondary">{author}</strong>
        <span aria-hidden="true">→</span>
        <span>{names[message.botId] ?? "Bot"}</span>
      </p>
      <ChatContent content={message.content} />
    </li>
  )
}
