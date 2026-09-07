import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query"
import { useSelector } from "@tanstack/react-store"
import { useCallback, useState } from "react"
import type { Bot } from "@src/shared/bots"
import type { ConversationMessage, MessageImage, MessageReply } from "@src/shared/conversations"
import type { Task } from "@src/shared/tasks"
import { BotFace } from "../bots/bot-face"
import type { EngineClient } from "../engine-client"
import { appSettingsStore } from "../settings/app-settings-store"
import { teamAvatarIdentities, teamNames, teamOf } from "../bots/team"
import {
  type ChatDraft,
  chatStore,
  dismissChatRun,
  emptyChatDraft,
  failChatRun,
  markChatAborting,
  setChatDraft,
  startChatRun,
  type ChatRun as ChatRunState,
} from "./chat-store"
import { ChatComposer } from "./chat-composer"
import { ChatQueue } from "./chat-queue"
import { ChatImage } from "./chat-images"
import { ChatScroller } from "./chat-scroller"
import { ChatStamped } from "./chat-stamp"
import { ChatActivity } from "./chat-activity"
import { ChatContent } from "./chat-content"
import { flattenHistory, historyPageInput, initialMessageLimit, olderHistoryPage, revealStep, windowHistory } from "./chat-history-window"
import { ChatMemberResult, memberResultKind } from "./chat-member-result"
import { ChatMentionChip } from "./chat-mention-chip"
import { type ChatMention, knownChatMentions, mentionedBotIds, splitChatMentions } from "./chat-mentions"
import { ChatPermissionRequest } from "./chat-permission-request"
import { ChatPluginRequest } from "./chat-plugin-request"
import { ChatQuestion, type QuestionAnswer } from "./chat-question"
import { finishConversationOpen } from "./chat-open-span"
import { chatGreeting } from "./chat-greetings"
import { ChatRoutineCall } from "./chat-routine-call"
import { ChatTriggerRun } from "./chat-trigger-run"
import { ChatTurnEnding } from "./chat-turn-ending"
import { ChatTeamControl } from "./chat-team-control"

const timeFormat = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" })

export function ChatWorkspace({ bot, client }: { bot: Bot; client: EngineClient }) {
  const [shown, setShown] = useState(initialMessageLimit)
  const activityDetailsVisible = useSelector(appSettingsStore, (state) => state.activityDetailsVisible)
  const { data: pages, error, isPending, isFetchedAfterMount, hasNextPage, isFetchingNextPage, fetchNextPage } = useInfiniteQuery(client.query.conversations.history.infiniteOptions({
    input: (before: string | undefined) => historyPageInput(bot.id, before),
    initialPageParam: undefined,
    getNextPageParam: olderHistoryPage,
  }))
  const history = pages ? flattenHistory(pages.pages) : undefined
  const messages = history?.messages
  const earlier = history?.earlier ?? 0
  const { data: groups } = useQuery(client.query.projects.list.queryOptions())
  const { data: tasks } = useQuery(client.query.tasks.listForBot.queryOptions({ input: { botId: bot.id } }))
  const names = teamNames(groups)
  const { members } = teamOf(groups, bot)
  const avatarIdentities = teamAvatarIdentities(groups)
  const tasksById = Object.fromEntries((tasks ?? []).map((task) => [task.id, task]))
  const { mutateAsync: abort } = useMutation(client.query.conversations.abort.mutationOptions())
  const { visible, hidden } = windowHistory(messages ?? [], shown)
  const historyIds = new Set(messages?.map((message) => message.id))
  const answersByQuestionId = Object.fromEntries((messages ?? []).flatMap((message) => message.replyTo ? [[message.replyTo.messageId, message.replyTo]] : []))
  const handleOpened = useCallback((section: HTMLElement | null) => {
    if (section && messages) {
      finishConversationOpen(client.raw.observations, { botId: bot.id, count: messages.length, state: isFetchedAfterMount ? "fetched" : "cached" })
    }
  }, [bot.id, client, isFetchedAfterMount, messages])

  async function sendPersonInput(message: { content: string; images: MessageImage[]; replyTo: MessageReply | null }, mentions: ChatDraft["mentions"]) {
    startChatRun(bot.id, { author: "person", authorBotId: null, taskId: null, triggerRunId: null, ...message }, "")

    return client.raw.conversations.send({ botId: bot.id, ...message, mentionedBotIds: mentionedBotIds(message.content, mentions) }).then(() => true).catch((sendError: unknown) => {
      failChatRun(bot.id, sendError instanceof Error ? sendError.message : "Não foi possível responder")

      return false
    })
  }

  async function handleSend(draft: ChatDraft, deliver: "queue" | "now") {
    const message = { content: draft.content.trim(), images: draft.images, replyTo: null }

    setChatDraft(bot.id, emptyChatDraft)

    if (!chatStore.state.runs[bot.id]) {
      await sendPersonInput(message, draft.mentions)

      return
    }

    await client.raw.conversations.send({ botId: bot.id, ...message, mentionedBotIds: mentionedBotIds(message.content, draft.mentions), deliver })
      .catch((sendError: unknown) => {
        setChatDraft(bot.id, draft)
        console.error("A mensagem voltou para o campo: o Engine não a aceitou", sendError)
      })
  }

  async function handleQuestionAnswer(messageId: string, optionValues: string[]) {
    return sendPersonInput({ content: "", images: [], replyTo: { messageId, optionValues } }, [])
  }

  async function revealEarlier() {
    if (hidden === 0 && hasNextPage) {
      await fetchNextPage()
    }

    setShown((count) => count + revealStep)
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
    <section ref={handleOpened} className="relative grid h-full min-h-0 min-w-0 grid-rows-[minmax(0,1fr)] overflow-hidden bg-surface before:pointer-events-none before:absolute before:top-0 before:right-2 before:left-px before:z-[1] before:h-3 before:rounded-tl-[23px] before:bg-[color-mix(in_srgb,var(--color-surface)_36%,transparent)] before:backdrop-blur-[6px] before:[clip-path:inset(0_round_23px_0_0)] before:[mask-image:linear-gradient(to_bottom,#000,transparent)] max-md:before:hidden">
      <ChatScroller footer={bot.closed ? <ChatClosed bot={bot} /> : <>
        <ChatTeamControl key={bot.id} bot={bot} members={members} client={client} />
        <ChatQueue bot={bot} client={client} />
        <ChatComposer bot={bot} client={client} onAbort={handleAbort} onSend={handleSend} />
      </>} {...(hidden + earlier > 0 ? { onRevealEarlier: revealEarlier } : {})}>
        {isPending && <ChatLoading />}
        {error && <ChatError message={error.message} />}
        {isFetchingNextPage && <ChatEarlierLoading />}
        {visible.map((message) => <ChatMessage key={message.id} activityDetailsVisible={activityDetailsVisible} answer={answersByQuestionId[message.id]} avatarIdentities={avatarIdentities} bot={bot} message={message} names={names} tasks={tasksById} onQuestionAnswer={handleQuestionAnswer} />)}
        {messages && <ChatRunSlot activityDetailsVisible={activityDetailsVisible} avatarIdentities={avatarIdentities} bot={bot} client={client} names={names} tasks={tasksById} historyIds={historyIds} empty={messages.length === 0} />}
      </ChatScroller>
    </section>
  )
}

function ChatEarlierLoading() {
  return (
    <div className="flex justify-center py-2 [overflow-anchor:none]">
      <span className="size-3.5 animate-spin rounded-full border border-outline-strong border-t-primary [animation-duration:800ms] motion-reduce:animate-none" role="status" aria-label="Carregando mensagens anteriores" />
    </div>
  )
}

function ChatRunSlot({ activityDetailsVisible, avatarIdentities, bot, client, names, tasks, historyIds, empty }: { activityDetailsVisible: boolean; avatarIdentities: Record<string, { name: string; avatarSeed: string }>; bot: Bot; client: EngineClient; names: Record<string, string>; tasks: Record<string, Task>; historyIds: Set<string>; empty: boolean }) {
  const run = useSelector(chatStore, (state) => state.runs[bot.id])

  if (run) {
    return <ChatRun activityDetailsVisible={activityDetailsVisible} avatarIdentities={avatarIdentities} bot={bot} client={client} names={names} run={run} tasks={tasks} historyIds={historyIds} />
  }

  if (empty) {
    return <EmptyChat bot={bot} />
  }

  return null
}

function ChatMessage({ activityDetailsVisible, answer, avatarIdentities, bot, message, names, tasks, onQuestionAnswer }: { activityDetailsVisible: boolean; answer?: MessageReply; avatarIdentities: Record<string, { name: string; avatarSeed: string }>; bot: Bot; message: ConversationMessage; names: Record<string, string>; tasks: Record<string, Task>; onQuestionAnswer?: QuestionAnswer }) {
  const fromOtherBot = message.author === "bot" && message.authorBotId !== null && message.authorBotId !== bot.id

  if (fromOtherBot) {
    return <ChatMemberMessage bot={bot} message={message} names={names} tasks={tasks} />
  }

  if (message.author === "routine") {
    if (!activityDetailsVisible) {
      return null
    }

    return <ChatRoutineCall botName={bot.name} time={formatMessageTime(message.createdAt)} content={message.content} />
  }

  if (message.author === "trigger") {
    if (!activityDetailsVisible) {
      return null
    }

    return <ChatTriggerRun botName={bot.name} time={formatMessageTime(message.createdAt)} content={message.content} />
  }

  const time = formatMessageTime(message.createdAt)

  if (message.author === "person") {
    if (message.replyTo) {
      return null
    }

    return <PersonBubble time={time} content={message.content} images={message.images} mentions={knownChatMentions(avatarIdentities)} />
  }

  return <BotBubble activityDetailsVisible={activityDetailsVisible} bot={bot} message={message} time={time} {...(answer ? { answer } : {})} {...(onQuestionAnswer ? { onQuestionAnswer } : {})} />
}

function ChatMemberMessage({ bot, message, names, tasks }: { bot: Pick<Bot, "id">; message: Pick<ConversationMessage, "authorBotId" | "taskId" | "createdAt" | "content">; names: Record<string, string>; tasks: Record<string, Task> }) {
  const task = tasks[message.taskId ?? ""]

  return <ChatMemberResult kind={memberResultKind(bot.id, task)} name={names[message.authorBotId ?? ""] ?? "Bot"} status={task?.status} time={formatMessageTime(message.createdAt)} content={message.content} />
}

function BotBubble({ activityDetailsVisible, answer, bot, message, time, onQuestionAnswer }: { activityDetailsVisible: boolean; answer?: MessageReply; bot: Bot; message: ConversationMessage; time: string; onQuestionAnswer?: QuestionAnswer }) {
  if (!activityDetailsVisible && !message.content && !message.ending) {
    return null
  }

  return (
    <article className="w-fit max-w-full self-start">
      {activityDetailsVisible && message.activity && <ChatActivity activity={message.activity} botName={bot.name} time={time} />}
      {(message.content || message.question) && (
        <ChatStamped className="chat-bot-bubble" copy={message.content} name={bot.name} time={time} anchor="bubble">
          {message.content && <ChatContent content={message.content} />}
          {message.question && <ChatQuestion botId={bot.id} messageId={message.id} question={message.question} answerValues={answer?.optionValues} interactive={!!onQuestionAnswer && !bot.closed} onAnswer={onQuestionAnswer ?? unavailableQuestionAnswer} />}
        </ChatStamped>
      )}
      {message.ending && <ChatStamped name={bot.name} time={time} anchor="text"><ChatTurnEnding botName={bot.name} ending={message.ending} {...(message.error ? { error: message.error } : {})} /></ChatStamped>}
    </article>
  )
}

function PersonBubble({ time, content, images, mentions }: { time: string; content: string; images: MessageImage[]; mentions: ChatMention[] }) {
  return (
    <ChatStamped className="flex max-w-[min(640px,84%)] flex-col gap-2 self-end rounded-[16px_16px_4px_16px] bg-surface-active px-4 py-3" copy={content} name="Você" time={time} side="left" anchor="bubble">
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((image, index) => <ChatImage key={`${index}-${image.data.length}`} className="block max-h-60 max-w-full rounded-lg border border-outline-strong object-contain" image={image} index={index} />)}
        </div>
      )}
      {content && (
        <p className="m-0 whitespace-pre-wrap text-body text-primary">
          {splitChatMentions(content, mentions).map((segment, index) => (segment.mention ? <ChatMentionChip key={`${index}-${segment.text}`} mention={segment.mention} /> : segment.text))}
        </p>
      )}
    </ChatStamped>
  )
}

function ChatRunMessage({ activityDetailsVisible, avatarIdentities, bot, names, run, tasks }: { activityDetailsVisible: boolean; avatarIdentities: Record<string, { name: string; avatarSeed: string }>; bot: Bot; names: Record<string, string>; run: ChatRunState; tasks: Record<string, Task> }) {
  if (run.message.author === "person") {
    if (run.message.replyTo) {
      return null
    }

    return <PersonBubble time="Agora" content={run.message.content} images={run.message.images} mentions={knownChatMentions(avatarIdentities)} />
  }

  if (run.message.author === "routine") {
    if (!activityDetailsVisible) {
      return null
    }

    return <ChatRoutineCall botName={bot.name} time="Agora" content={run.message.content} open />
  }

  if (run.message.author === "trigger") {
    if (!activityDetailsVisible) {
      return null
    }

    return <ChatTriggerRun botName={bot.name} time="Agora" content={run.message.content} open />
  }

  const task = tasks[run.message.taskId ?? ""]

  return <ChatMemberResult kind={memberResultKind(bot.id, task)} name={names[run.message.authorBotId ?? ""] ?? "Bot"} status={task?.status} time="Agora" content={run.message.content} open />
}

function ChatRun({ activityDetailsVisible, avatarIdentities, bot, client, names, run, tasks, historyIds }: { activityDetailsVisible: boolean; avatarIdentities: Record<string, { name: string; avatarSeed: string }>; bot: Bot; client: EngineClient; names: Record<string, string>; run: ChatRunState; tasks: Record<string, Task>; historyIds: Set<string> }) {
  const permissionRequest = run.permissionRequests[0]
  const pluginRequest = run.pluginRequests[0]
  const awaitingDecision = !!permissionRequest || !!pluginRequest
  const workingSilently = !activityDetailsVisible && run.status === "running" && !awaitingDecision
  const awaitingNotebook = window.desktop.remote && awaitingHandoff(run)

  return (
    <>
      {!historyIds.has(run.messageId) && <ChatRunMessage activityDetailsVisible={activityDetailsVisible} avatarIdentities={avatarIdentities} bot={bot} names={names} run={run} tasks={tasks} />}
      {run.completedMessages.filter((message) => !historyIds.has(message.id)).map((message) => <ChatMessage key={message.id} activityDetailsVisible={activityDetailsVisible} avatarIdentities={avatarIdentities} bot={bot} message={message} names={names} tasks={tasks} />)}
      <article className="flex w-fit max-w-full flex-col gap-3 self-start">
        {activityDetailsVisible && <ChatActivity activity={withoutRequestedDetails(run)} botName={bot.name} time="Agora" status={run.status} compacting={run.compacting} waitingMessage={run.waitingMessage} />}
        {permissionRequest && <ChatStamped className="chat-request-bubble" name={bot.name} time="Agora" anchor="bubble"><ChatPermissionRequest botId={bot.id} client={client} request={permissionRequest} remaining={run.permissionRequests.length - 1} /></ChatStamped>}
        {!permissionRequest && pluginRequest && <ChatStamped className="chat-request-bubble" name={bot.name} time="Agora" anchor="bubble"><ChatPluginRequest botId={bot.id} client={client} request={pluginRequest} step={run.pluginSteps[pluginRequest.id]} /></ChatStamped>}
        {workingSilently && <ChatWorkingIndicator botName={bot.name} />}
        {awaitingNotebook && <p className="m-0 text-support text-secondary" role="status">Aguardando você no notebook. O Bot entregou o navegador para você assumir lá.</p>}
        {run.error && <div className="mt-3.5 flex items-start gap-3 max-[700px]:flex-wrap"><div className="min-w-0 flex-1"><strong className="text-control font-semibold text-primary">O bot parou</strong><p className="mt-[3px] mb-0 text-support text-secondary">{run.error}</p></div><button className="flex-none rounded-lg border border-outline-strong bg-transparent px-3 py-2 text-metadata font-medium text-secondary hover:bg-surface-hover hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" type="button" onClick={() => dismissChatRun(bot.id)}>Fechar</button></div>}
      </article>
    </>
  )
}

function awaitingHandoff(run: ChatRunState) {
  return run.steps.some((step) => step.type === "tool" && step.tools.some((tool) => tool.name === "browser" && tool.detail === "handoff" && tool.status === "running"))
}

async function unavailableQuestionAnswer() {
  return false
}

function ChatWorkingIndicator({ botName }: { botName: string }) {
  return (
    <div className="flex w-fit items-center gap-1" role="status" aria-label={`${botName} está trabalhando`}>
      <span className="size-1.5 animate-pulse rounded-full bg-muted [animation-duration:900ms] motion-reduce:animate-none" aria-hidden="true" />
      <span className="size-1.5 animate-pulse rounded-full bg-muted [animation-delay:150ms] [animation-duration:900ms] motion-reduce:animate-none" aria-hidden="true" />
      <span className="size-1.5 animate-pulse rounded-full bg-muted [animation-delay:300ms] [animation-duration:900ms] motion-reduce:animate-none" aria-hidden="true" />
    </div>
  )
}

function ChatClosed({ bot }: { bot: Bot }) {
  return (
    <p className="mx-auto my-0 w-[min(680px,calc(100%-48px))] rounded-full border border-outline bg-surface-raised px-4 py-3 text-center text-support text-muted max-[700px]:w-[calc(100%-28px)]" role="status">
      {bot.name} foi encerrado. O histórico da Tarefa continua disponível.
    </p>
  )
}

function EmptyChat({ bot }: { bot: Bot }) {
  return (
    <div className="m-auto flex max-w-[520px] flex-col items-center text-center text-support text-secondary">
      <BotFace className="size-[77px] flex-none" name={bot.avatarSeed} botId={bot.id} size={77} />
      <h2 className="mt-4 mb-1.5 text-title font-semibold text-primary">{bot.name}</h2>
      <p className="m-0 max-w-[48ch] text-body leading-[1.6] text-secondary">{chatGreeting(bot.id)}</p>
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

function withoutRequestedDetails(run: ChatRunState) {
  const requested = new Set(run.permissionRequests.map((request) => request.id))

  if (requested.size === 0) {
    return run
  }

  return {
    ...run,
    steps: run.steps.map((step) => step.type === "tool"
      ? { ...step, tools: step.tools.map(({ detail, ...tool }) => requested.has(tool.callId) || detail === undefined ? tool : { ...tool, detail }) }
      : step),
  }
}
