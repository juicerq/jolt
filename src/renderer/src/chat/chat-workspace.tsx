import { Blobatar } from "@blobatar/react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useSelector } from "@tanstack/react-store"
import { useCallback, useState } from "react"
import type { Bot } from "../../../shared/bots"
import type { ConversationMessage, MessageImage } from "../../../shared/conversations"
import type { TaskStatus } from "../../../shared/tasks"
import type { EngineClient } from "../engine-client"
import { teamNames } from "../bots/team"
import { Button } from "../ui/button"
import {
  type ChatDraft,
  chatStore,
  dismissChatRun,
  failChatRun,
  markChatAborting,
  startChatRun,
  type ChatRun as ChatRunState,
} from "./chat-store"
import { ChatComposer } from "./chat-composer"
import { messageImageSource } from "./chat-images"
import { ChatScroller, useRevealAbove } from "./chat-scroller"
import { ChatStamped } from "./chat-stamp"
import { ChatActivity } from "./chat-activity"
import { ChatContent } from "./chat-content"
import { earlierMessageBatch, recentMessageLimit, windowHistory } from "./chat-history-window"
import { ChatMemberResult } from "./chat-member-result"
import { finishConversationOpen } from "./chat-open-span"
import { ChatRoutineCall } from "./chat-routine-call"
import { ChatTurnEnding } from "./chat-turn-ending"

const timeFormat = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" })

export function ChatWorkspace({ bot, client }: { bot: Bot; client: EngineClient }) {
  const [shown, setShown] = useState(recentMessageLimit)
  const historyOptions = client.query.conversations.history.queryOptions({ input: { botId: bot.id } })
  const { data: messages, error, isPending, isFetchedAfterMount } = useQuery(historyOptions)
  const { data: groups } = useQuery(client.query.projects.list.queryOptions())
  const { data: tasks } = useQuery(client.query.tasks.listForLeader.queryOptions({ input: { leaderBotId: bot.id } }))
  const names = teamNames(groups)
  const taskStatuses = Object.fromEntries((tasks ?? []).map((task) => [task.id, task.status]))
  const { mutateAsync: abort } = useMutation(client.query.conversations.abort.mutationOptions())
  const { visible, hidden } = windowHistory(messages ?? [], shown)
  const handleOpened = useCallback((section: HTMLElement | null) => {
    if (section && messages) {
      finishConversationOpen(client.raw.observations, { botId: bot.id, count: messages.length, state: isFetchedAfterMount ? "fetched" : "cached" })
    }
  }, [bot.id, client, isFetchedAfterMount, messages])

  async function handleSend(draft: ChatDraft) {
    const message = { ...draft, content: draft.content.trim() }

    startChatRun(bot.id, { author: "person", authorBotId: null, taskId: null, ...message })
    await client.raw.conversations.send({ botId: bot.id, ...message }).catch((sendError: unknown) => {
      failChatRun(bot.id, sendError instanceof Error ? sendError.message : "Não foi possível responder")
    })
  }

  async function handleAbort() {
    const run = chatStore.state.runs[bot.id]

    if (!run || run.status === "aborting") {
      return
    }

    markChatAborting(bot.id)
    await abort({ botId: bot.id }).catch((abortError: unknown) => {
      failChatRun(bot.id, abortError instanceof Error ? abortError.message : "Não foi possível interromper")
    })
  }

  return (
    <section ref={handleOpened} className="relative grid h-full min-h-0 min-w-0 grid-rows-[minmax(0,1fr)] overflow-hidden bg-surface before:pointer-events-none before:absolute before:top-0 before:right-2 before:left-px before:z-[1] before:h-3 before:rounded-tl-[23px] before:bg-[color-mix(in_srgb,var(--color-surface)_36%,transparent)] before:backdrop-blur-[6px] before:[clip-path:inset(0_round_23px_0_0)] before:[mask-image:linear-gradient(to_bottom,#000,transparent)]">
      <ChatScroller>
        {isPending && <ChatLoading />}
        {error && <ChatError message={error.message} />}
        {hidden > 0 && <ChatEarlierMessages hidden={hidden} onShow={() => setShown((count) => count + earlierMessageBatch)} />}
        {visible.map((message) => <ChatMessage key={message.id} bot={bot} message={message} names={names} taskStatuses={taskStatuses} />)}
        {messages && <ChatRunSlot bot={bot} names={names} taskStatuses={taskStatuses} empty={messages.length === 0} />}
      </ChatScroller>
      {bot.closed ? <ChatClosed bot={bot} /> : <ChatComposer bot={bot} client={client} onAbort={handleAbort} onSend={handleSend} />}
    </section>
  )
}

function ChatEarlierMessages({ hidden, onShow }: { hidden: number; onShow(): void }) {
  const revealAbove = useRevealAbove()

  return (
    <div className="flex justify-center">
      <Button variant="secondary" type="button" onClick={() => revealAbove(onShow)}>Mostrar mensagens anteriores ({hidden})</Button>
    </div>
  )
}

function ChatRunSlot({ bot, names, taskStatuses, empty }: { bot: Bot; names: Record<string, string>; taskStatuses: Record<string, TaskStatus>; empty: boolean }) {
  const run = useSelector(chatStore, (state) => state.runs[bot.id])

  if (run) {
    return <ChatRun bot={bot} names={names} run={run} taskStatuses={taskStatuses} />
  }

  if (empty) {
    return <EmptyChat bot={bot} />
  }

  return null
}

function memberMessageKind(bot: Pick<Bot, "leaderBotId">, message: Pick<ConversationMessage, "authorBotId">) {
  if (message.authorBotId === bot.leaderBotId) {
    return "assignment"
  }

  return "result"
}

function ChatMessage({ bot, message, names, taskStatuses }: { bot: Bot; message: ConversationMessage; names: Record<string, string>; taskStatuses: Record<string, TaskStatus> }) {
  const fromOtherBot = message.author === "bot" && message.authorBotId !== null && message.authorBotId !== bot.id

  if (fromOtherBot) {
    return <ChatMemberResult kind={memberMessageKind(bot, message)} name={names[message.authorBotId ?? ""] ?? "Bot"} status={taskStatuses[message.taskId ?? ""]} time={formatMessageTime(message.createdAt)} content={message.content} />
  }

  if (message.author === "routine") {
    return <ChatRoutineCall botName={bot.name} time={formatMessageTime(message.createdAt)} content={message.content} />
  }

  const time = formatMessageTime(message.createdAt)

  if (message.author === "person") {
    return <PersonBubble time={time} content={message.content} images={message.images} />
  }

  return (
    <article className="w-fit max-w-[720px] self-start">
      {message.activity && <ChatActivity activity={message.activity} botName={bot.name} time={time} />}
      <ChatStamped name={bot.name} time={time} anchor="text">
        {message.content && <ChatContent content={message.content} />}
        {message.ending && <ChatTurnEnding botName={bot.name} ending={message.ending} />}
      </ChatStamped>
    </article>
  )
}

function PersonBubble({ time, content, images }: { time: string; content: string; images: MessageImage[] }) {
  return (
    <ChatStamped className="flex max-w-[min(640px,84%)] flex-col gap-2 self-end rounded-[16px_16px_4px_16px] bg-surface-active px-4 py-3" name="Você" time={time} side="left" anchor="bubble">
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((image, index) => <img key={`${index}-${image.data.length}`} className="block max-h-60 max-w-full rounded-lg border border-outline-strong object-contain" src={messageImageSource(image)} alt={`Imagem ${index + 1}`} />)}
        </div>
      )}
      {content && <p className="m-0 whitespace-pre-wrap text-body text-primary">{content}</p>}
    </ChatStamped>
  )
}

function ChatRunMessage({ bot, names, run, taskStatuses }: { bot: Bot; names: Record<string, string>; run: ChatRunState; taskStatuses: Record<string, TaskStatus> }) {
  if (run.message.author === "person") {
    return <PersonBubble time="Agora" content={run.message.content} images={run.message.images} />
  }

  if (run.message.author === "routine") {
    return <ChatRoutineCall botName={bot.name} time="Agora" content={run.message.content} open />
  }

  return <ChatMemberResult kind={memberMessageKind(bot, run.message)} name={names[run.message.authorBotId ?? ""] ?? "Bot"} status={taskStatuses[run.message.taskId ?? ""]} time="Agora" content={run.message.content} open />
}

function ChatRun({ bot, names, run, taskStatuses }: { bot: Bot; names: Record<string, string>; run: ChatRunState; taskStatuses: Record<string, TaskStatus> }) {
  return (
    <>
      <ChatRunMessage bot={bot} names={names} run={run} taskStatuses={taskStatuses} />
      <article className="w-fit max-w-[720px] self-start">
        <ChatActivity activity={run} botName={bot.name} time="Agora" status={run.status} waitingMessage={run.waitingMessage} />
        <ChatStamped name={bot.name} time="Agora" anchor="text">
          {run.responseContent && <ChatContent content={run.responseContent} />}
        </ChatStamped>
        {run.error && <div className="mt-3.5 flex items-center gap-3 rounded-xl border border-[color-mix(in_srgb,var(--color-status-error)_45%,transparent)] bg-[color-mix(in_srgb,var(--color-status-error)_10%,var(--color-surface))] p-3 max-[700px]:flex-wrap max-[700px]:items-start"><div className="min-w-0 flex-1"><strong className="text-control font-semibold text-primary">O bot parou</strong><p className="mt-[3px] mb-0 text-support text-secondary">{run.error}</p></div><button className="flex-none rounded-lg border border-outline-strong bg-transparent px-3 py-2 text-metadata font-medium text-secondary hover:bg-surface-hover hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" type="button" onClick={() => dismissChatRun(bot.id)}>Fechar</button></div>}
      </article>
    </>
  )
}

function ChatClosed({ bot }: { bot: Bot }) {
  return (
    <p className="z-[1] col-start-1 row-start-1 m-0 mb-[22px] w-[min(680px,calc(100%-48px))] self-end justify-self-center rounded-full border border-outline bg-surface-raised px-4 py-3 text-center text-support text-muted max-[700px]:w-[calc(100%-28px)]" role="status">
      {bot.name} encerrou com a Tarefa. O histórico fica aqui.
    </p>
  )
}

function EmptyChat({ bot }: { bot: Bot }) {
  return (
    <div className="m-auto flex max-w-[520px] flex-col items-center text-center text-support text-secondary">
      <Blobatar className="size-16 flex-none rounded-[18px] border border-outline-strong bg-surface-raised" name={`jolt:${bot.id}:${bot.name}`} size={64} alt="" />
      <h2 className="mt-4 mb-1.5 text-title font-semibold text-primary">Converse com {bot.name}</h2>
      <p className="m-0 max-w-[48ch] leading-[1.6]">{bot.function.outcome}</p>
    </div>
  )
}

function ChatLoading() {
  return <div className="flex min-h-[220px] items-center justify-center gap-[7px] text-muted" aria-label="Carregando conversa"><span className="size-1.5 animate-pulse rounded-full bg-secondary [animation-duration:900ms] motion-reduce:animate-none" /><span className="size-1.5 animate-pulse rounded-full bg-secondary [animation-delay:150ms] [animation-duration:900ms] motion-reduce:animate-none" /><span className="size-1.5 animate-pulse rounded-full bg-secondary [animation-delay:300ms] [animation-duration:900ms] motion-reduce:animate-none" /></div>
}

function ChatError({ message }: { message: string }) {
  return <div className="flex min-h-[220px] flex-col items-center justify-center gap-[7px] text-center text-muted"><strong className="text-section font-semibold text-primary">Não foi possível abrir a conversa</strong><span className="text-support text-secondary">{message}</span></div>
}

function formatMessageTime(createdAt: string) {
  const timestamp = Date.parse(createdAt)

  if (Number.isNaN(timestamp)) {
    return createdAt
  }

  return timeFormat.format(timestamp)
}
