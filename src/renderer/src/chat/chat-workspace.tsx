import { Blobatar } from "@blobatar/react"
import { ArrowUpIcon, StopIcon } from "@heroicons/react/24/outline"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useSelector } from "@tanstack/react-store"
import { type KeyboardEvent, useCallback, useRef, useState } from "react"
import type { Bot } from "../../../shared/bots"
import type { ConversationMessage } from "../../../shared/conversations"
import type { TaskStatus } from "../../../shared/tasks"
import type { EngineClient } from "../engine-client"
import { IconButton } from "../ui/icon-button"
import {
  chatStore,
  dismissChatRun,
  failChatRun,
  markChatAborting,
  setChatDraft,
  startChatRun,
  type ChatRun as ChatRunState,
} from "./chat-store"
import { ChatScroller } from "./chat-scroller"
import { ChatStamped } from "./chat-stamp"
import { ChatActivity } from "./chat-activity"
import { ChatContent } from "./chat-content"
import { ChatMemberResult } from "./chat-member-result"
import { ChatRoutineCall } from "./chat-routine-call"
import { ChatTurnEnding } from "./chat-turn-ending"

export function ChatWorkspace({ bot, client }: { bot: Bot; client: EngineClient }) {
  const draft = useSelector(chatStore, (state) => state.drafts[bot.id] ?? "")
  const run = useSelector(chatStore, (state) => state.runs[bot.id])
  const [composerExpanded, setComposerExpanded] = useState(false)
  const composerObserverRef = useRef<ResizeObserver | null>(null)
  const historyOptions = client.query.conversations.history.queryOptions({ input: { botId: bot.id } })
  const { data: messages, error, isPending } = useQuery(historyOptions)
  const { data: allBots } = useQuery(client.query.bots.list.queryOptions())
  const { data: tasks } = useQuery(client.query.tasks.listForLeader.queryOptions({ input: { leaderBotId: bot.id } }))
  const names = Object.fromEntries((allBots ?? []).map((entry) => [entry.id, entry.name]))
  const taskStatuses = Object.fromEntries((tasks ?? []).map((task) => [task.id, task.status]))
  const { mutateAsync: abort } = useMutation(client.query.conversations.abort.mutationOptions())

  const attachComposer = useCallback((composer: HTMLTextAreaElement | null) => {
    composerObserverRef.current?.disconnect()

    if (!composer) {
      return
    }

    const element = composer

    function updateComposerLayout() {
      const styles = getComputedStyle(element)
      const contentHeight = element.clientHeight - Number.parseFloat(styles.paddingTop) - Number.parseFloat(styles.paddingBottom)
      const lineHeight = Number.parseFloat(styles.lineHeight)

      setComposerExpanded(contentHeight > lineHeight * 1.5)
    }

    composerObserverRef.current = new ResizeObserver(updateComposerLayout)
    composerObserverRef.current.observe(element)
    updateComposerLayout()
  }, [])

  async function handleSend() {
    const content = draft.trim()

    if (!content || run) {
      return
    }

    startChatRun(bot.id, { author: "person", authorBotId: null, taskId: null, content })
    await client.raw.conversations.send({ botId: bot.id, content }).catch((sendError: unknown) => {
      failChatRun(bot.id, sendError instanceof Error ? sendError.message : "Não foi possível responder")
    })
  }

  async function handleAbort() {
    if (!run || run.status === "aborting") {
      return
    }

    markChatAborting(bot.id)
    await abort({ botId: bot.id }).catch((abortError: unknown) => {
      failChatRun(bot.id, abortError instanceof Error ? abortError.message : "Não foi possível interromper")
    })
  }

  function handleComposerKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
      return
    }

    event.preventDefault()
    handleSend()
  }

  return (
    <section className="relative grid h-full min-h-0 min-w-0 grid-rows-[minmax(0,1fr)] overflow-hidden bg-surface before:pointer-events-none before:absolute before:top-0 before:right-2 before:left-px before:z-[1] before:h-3 before:rounded-tl-[23px] before:bg-[color-mix(in_srgb,var(--color-surface)_36%,transparent)] before:backdrop-blur-[6px] before:[clip-path:inset(0_round_23px_0_0)] before:[mask-image:linear-gradient(to_bottom,#000,transparent)]">
      <ChatScroller>
        {isPending && <ChatLoading />}
        {error && <ChatError message={error.message} />}
        {!isPending && !error && messages?.length === 0 && !run && <EmptyChat bot={bot} />}
        {messages?.map((message) => <ChatMessage key={message.id} bot={bot} message={message} names={names} taskStatuses={taskStatuses} />)}
        {run && <ChatRun bot={bot} names={names} run={run} taskStatuses={taskStatuses} />}
      </ChatScroller>
      {bot.closed ? <ChatClosed bot={bot} /> : (
        <div className={`z-[1] col-start-1 row-start-1 mb-[22px] grid w-[min(680px,calc(100%-48px))] box-border self-end justify-self-center grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border border-outline-strong bg-surface-raised px-2 py-[7px] shadow-[0_14px_32px_rgb(0_0_0_/_24%)] focus-within:border-muted max-[700px]:w-[calc(100%-28px)] ${composerExpanded ? "grid-rows-[auto_auto] gap-y-1 rounded-[18px]" : "rounded-full"}`}>
          <label className="sr-only" htmlFor={`prompt-${bot.id}`}>Mensagem para {bot.name}</label>
          <textarea
            className={`field-sizing-content box-border max-h-40 resize-none overflow-y-auto rounded-lg border-0 bg-transparent text-body text-primary placeholder:text-muted disabled:opacity-60 focus-visible:outline-none ${composerExpanded ? "col-span-full min-h-[25px] py-0 pr-[46px] pl-1" : "min-h-[34px] px-1 py-2"}`}
            id={`prompt-${bot.id}`}
            placeholder={`Converse com ${bot.name}...`}
            value={draft}
            rows={1}
            ref={attachComposer}
            disabled={!!run}
            onChange={(event) => setChatDraft(bot.id, event.target.value)}
            onKeyDown={handleComposerKey}
          />
          {run
            ? <IconButton className={composerExpanded ? "col-start-2 row-start-2" : undefined} iconSize={14} shape="circle" size={34} tone="danger" type="button" disabled={run.status === "aborting"} label={run.status === "aborting" ? "Interrompendo resposta" : "Interromper resposta"} tooltipPlacement="top" onClick={handleAbort}><StopIcon aria-hidden="true" /></IconButton>
            : <IconButton className={`${composerExpanded ? "col-start-2 row-start-2 " : ""}active:scale-96 [&>svg]:stroke-2`} shape="circle" size={34} tone="primary" type="button" disabled={!draft.trim()} label="Enviar mensagem" tooltipPlacement="top" onClick={handleSend}><ArrowUpIcon aria-hidden="true" /></IconButton>}
        </div>
      )}
    </section>
  )
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
    return <PersonBubble time={time} content={message.content} />
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

function PersonBubble({ time, content }: { time: string; content: string }) {
  return (
    <ChatStamped className="max-w-[min(640px,84%)] self-end rounded-[16px_16px_4px_16px] bg-surface-active px-4 py-3" name="Você" time={time} side="left" anchor="bubble">
      <p className="m-0 whitespace-pre-wrap text-body text-primary">{content}</p>
    </ChatStamped>
  )
}

function ChatRunMessage({ bot, names, run, taskStatuses }: { bot: Bot; names: Record<string, string>; run: ChatRunState; taskStatuses: Record<string, TaskStatus> }) {
  if (run.message.author === "person") {
    return <PersonBubble time="Agora" content={run.message.content} />
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

  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(timestamp)
}
