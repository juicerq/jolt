import type { Bot } from "@src/shared/bots"
import type { createBots } from "../bots/bots"
import type { Observability } from "../observability/observability"
import type { createPiAgentRuntime, PiTool } from "../pi/pi-agent-runtime"
import { toolsForPermissionMode } from "../pi/pi-permissions"
import type { AppDatabase } from "../persistence/database"
import type { createTasks } from "../tasks/tasks"
import type { Routine } from "@src/shared/routines"
import type { Trigger, TriggerRun } from "@src/shared/triggers"
import { conversationSchemas, askTool, sendMessageTool, type BotConversationEvent, type ConversationEvent, type ConversationMessage, type FinishReason, type IncomingMessage, type MessageQuestion, type MessageReply, type QueuedMessage, type TurnContext, type TurnEnding } from "@src/shared/conversations"
import { createConversationTools } from "./conversation-tools"
import { createConversationActivityRecorder } from "./conversation-activity"
import { createDelegation } from "./delegation"
import { botInstructions } from "./bot-instructions"
import { parse } from "@src/shared/parse"
import { createQueue } from "../queue"
import { createMessageQueue } from "./message-queue"
import { createHistory } from "./history"

const defaultTools = ["read", "grep", "find", "ls", "bash", "edit", "write"]
const turnEndings: Record<FinishReason, TurnEnding | null> = { stop: null, aborted: "aborted", error: "failed" }

const unknownErrorReason = "O Provider não informou o motivo"

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === "string") {
    return error
  }

  return unknownErrorReason
}

function describeError(error: unknown) {
  return errorMessage(error).trim().slice(0, 500) || unknownErrorReason
}

export interface BotInheritance { apply(member: Pick<Bot, "id">): void }

export interface BotExtension {
  tools(bot: Bot): PiTool[]
  instructions(bot: Bot): string
  pending?(botId: string): ConversationEvent[]
  inheritance?(leader: Bot, references: string | undefined): BotInheritance
}

export interface TurnResult { reason: FinishReason; response: string; error?: string }
interface ActiveTurn {
  message: ConversationMessage
  settled: Promise<void>
  signal: AbortSignal
  sender?: TurnSender
  abort(): Promise<void>
  release(): void
}
interface TurnSender { bot(content: string, question: MessageQuestion | null): void; person(message: IncomingMessage): void }
type RoutineCall = Pick<Routine, "id" | "botId" | "content" | "frequency"> & { nextCallAt: string }
interface TriggerCall { trigger: Trigger; run: TriggerRun }

export function createConversations(input: {
  database: AppDatabase
  bots: ReturnType<typeof createBots>
  tasks: ReturnType<typeof createTasks>
  runtime: ReturnType<typeof createPiAgentRuntime>
  observability: Observability
  extensions: BotExtension[]
}) {
  const shutdown = new AbortController()
  const sessions = new Map<string, string>()
  const active = new Map<string, ActiveTurn>()
  const compactions = new Map<string, Promise<void>>()
  const answering = new Set<string>()
  const streams = new Set<ReturnType<typeof createQueue<BotConversationEvent>>>()
  const waitingOn = new Set<{ callerId: string; targetId: string }>()
  const messageQueue = createMessageQueue()
  const stopping = new Set<string>()
  const delegation = createDelegation({
    bots: input.bots,
    tasks: input.tasks,
    observability: input.observability,
    runTurn,
    active: (botId) => active.get(botId)?.message,
    assertCallable,
    inheritance: (leader, references) => input.extensions.flatMap((extension) => extension.inheritance ? [extension.inheritance(leader, references)] : []),
  })
  const extensions: BotExtension[] = [delegation, createHistory(input.database), ...input.extensions]

  closeUnanswered()

  function closeUnanswered() {
    const unanswered = input.database.conversations.lastMessages().filter((message) => message.authorBotId !== message.botId)

    for (const message of unanswered) {
      input.database.conversations.append({ id: crypto.randomUUID(), botId: message.botId, author: "bot", authorBotId: message.botId, taskId: message.taskId, triggerRunId: message.triggerRunId, content: "", images: [], question: null, replyTo: null, activity: null, ending: "closed", createdAt: new Date().toISOString() })
    }

    input.observability.event({ name: "conversation.closeunanswered", attributes: { count: unanswered.length } })
  }

  async function open(botId: string) {
    const bot = input.bots.get({ id: botId })

    if (!bot) {
      throw new Error("Bot not found")
    }

    if (bot.closed) {
      throw new Error(`${bot.name} was closed with its Tarefa`)
    }

    const cwd = await input.bots.resolveWorkingDirectory({ id: botId })
    const botDirectory = await input.bots.directory({ id: botId })
    const customTools = [
      ...createConversationTools((content, question) => {
        const turn = active.get(botId)

        if (!turn?.sender) {
          throw new Error("No active conversation turn")
        }

        turn.signal.throwIfAborted()
        turn.sender.bot(content, question)
      }),
      ...extensions.flatMap((extension) => extension.tools(bot)),
    ]
    const tools = toolsForPermissionMode(bot.permissionMode, [...defaultTools, ...customTools.map((tool) => tool.name)])
    const project = bot.projectId ? input.database.projects.get(bot.projectId) : undefined

    if (bot.projectId && !project) {
      throw new Error("Project not found")
    }

    const instructions = botInstructions({ bot, directory: botDirectory, ...(project ? { project } : {}), extensions: extensions.map((extension) => extension.instructions(bot)) })
    const profile = JSON.stringify({ cwd, tools, instructions, provider: bot.provider, effort: bot.effort, model: bot.model, permissionMode: bot.permissionMode })

    if (sessions.get(botId) === profile) {
      return
    }

    const sessionFile = input.database.conversations.sessionFile(botId)
    const result = await input.runtime.open({
      botId,
      cwd,
      botDirectory,
      tools,
      provider: bot.provider,
      effort: bot.effort,
      model: bot.model,
      permissionMode: bot.permissionMode,
      customTools,
      instructions,
      ...(sessionFile ? { sessionFile } : {}),
    })

    if (result.sessionFile) {
      input.database.conversations.saveSessionFile(botId, result.sessionFile)
    }

    sessions.set(botId, profile)
  }

  function incoming(message: ConversationMessage): IncomingMessage {
    return { author: message.author, authorBotId: message.authorBotId, taskId: message.taskId, triggerRunId: message.triggerRunId, content: message.content, images: message.images, replyTo: message.replyTo }
  }

  function contextFor(message: ConversationMessage, options?: { routine?: RoutineCall; trigger?: TriggerCall }): TurnContext {
    const moment = { startedAt: message.createdAt, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }

    if (message.author === "routine") {
      if (!options?.routine) {
        throw new Error("Rotina context is missing")
      }

      return { cause: "routine", routineId: options.routine.id, frequency: options.routine.frequency, scheduledFor: options.routine.nextCallAt, ...moment }
    }

    if (message.author === "trigger") {
      if (!options?.trigger || message.triggerRunId !== options.trigger.run.id) {
        throw new Error("Gatilho context is missing")
      }

      return { cause: "trigger", triggerId: options.trigger.trigger.id, triggerRunId: options.trigger.run.id, event: options.trigger.run.event, ...moment }
    }

    if (message.author === "bot") {
      const sender = message.authorBotId ? input.bots.get({ id: message.authorBotId }) : undefined
      const task = message.taskId ? input.tasks.get(message.taskId) : undefined

      if (!sender || !task) {
        throw new Error("Tarefa context is missing")
      }

      if (message.botId === task.callerBotId) {
        return { cause: "task-result", taskId: task.id, sender: { id: sender.id, name: sender.name }, status: task.status, ...moment }
      }

      return { cause: "task-assignment", taskId: task.id, sender: { id: sender.id, name: sender.name }, ...moment }
    }

    return { cause: "person", ...moment }
  }

  function awaitedBy(botId: string) {
    const waited = [...waitingOn].filter((wait) => wait.callerId === botId).map((wait) => wait.targetId)
    const assigned = Array.from(active).flatMap(([id, turn]) => {
      const task = turn.message.author === "bot" && turn.message.taskId ? input.tasks.get(turn.message.taskId) : undefined

      if (turn.message.authorBotId !== botId || task?.assigneeBotId !== id) {
        return []
      }

      return [id]
    })

    return [...waited, ...assigned]
  }

  function blockedBy(callerId: string, targetId: string) {
    const seen = new Set<string>()
    const pending = [targetId]

    for (let node = pending.pop(); node; node = pending.pop()) {
      if (node === callerId) {
        return true
      }

      if (!seen.has(node)) {
        seen.add(node)
        pending.push(...awaitedBy(node))
      }
    }

    return false
  }

  function assertCallable(caller: Pick<Bot, "id">, target: Pick<Bot, "id" | "name">) {
    const busy = active.has(target.id)

    if (busy && blockedBy(caller.id, target.id)) {
      throw new Error(`${target.name} is waiting for you to finish and cannot take a Tarefa from you now`)
    }
  }

  function untilSettled(settled: Promise<void>, signal?: AbortSignal) {
    if (!signal) {
      return settled
    }

    return new Promise<void>((resolve, reject) => {
      const interrupt = () => reject(new Error("The person interrupted you while you waited for that Bot"))

      if (signal.aborted) {
        interrupt()

        return
      }

      signal.addEventListener("abort", interrupt, { once: true })
      void settled.then(() => {
        signal.removeEventListener("abort", interrupt)
        resolve()
      })
    })
  }

  async function waitForTurn(botId: string, callerId: IncomingMessage["authorBotId"], current: Pick<ActiveTurn, "settled">, signal?: AbortSignal) {
    if (!callerId) {
      throw new Error("Tarefa sender is missing")
    }

    const bot = input.bots.get({ id: botId })

    assertCallable({ id: callerId }, { id: botId, name: bot?.name ?? botId })

    const wait = { callerId, targetId: botId }
    waitingOn.add(wait)

    try {
      await untilSettled(current.settled, signal)
    } finally {
      waitingOn.delete(wait)
    }
  }

  async function claim(botId: string, message: IncomingMessage, signal?: AbortSignal): Promise<ActiveTurn> {
    signal?.throwIfAborted()

    if (stopping.has(botId)) {
      throw new Error("Aguarde a interrupção do trabalho do time terminar.")
    }

    if (compactions.has(botId)) {
      throw new Error("Bot is compacting its Context")
    }

    const current = active.get(botId)

    if (current && (message.author === "routine" || message.author === "trigger")) {
      throw new Error("Bot is already working")
    }

    if (current && message.author === "bot") {
      await waitForTurn(botId, message.authorBotId, current, signal)

      return claim(botId, message, signal)
    }

    if (current?.message.author === "person") {
      throw new Error("Bot is already working")
    }

    if (current) {
      await current.abort()

      return claim(botId, { ...message, taskId: message.taskId ?? current.message.taskId }, signal)
    }

    const { promise: settled, resolve: settle } = Promise.withResolvers<void>()
    const opened: ConversationMessage = { id: crypto.randomUUID(), botId, ...message, question: null, activity: null, ending: null, createdAt: new Date().toISOString() }
    const cancellation = new AbortController()
    const turn: ActiveTurn = {
      message: opened,
      settled,
      signal: AbortSignal.any([cancellation.signal, ...(signal ? [signal] : [])]),
      async abort() {
        cancellation.abort()
        await settled
      },
      release() {
        active.delete(botId)
        settle()
      },
    }
    active.set(botId, turn)

    return turn
  }

  function deliver(botId: string, event: ConversationEvent) {
    for (const stream of streams) {
      stream.push({ botId, event })
    }
  }

  function publishQueue(botId: string) {
    deliver(botId, { type: "queue-changed", queued: messageQueue.list(botId) })
  }

  function queuedIncoming(queued: QueuedMessage): IncomingMessage {
    return { author: "person", authorBotId: null, taskId: null, triggerRunId: null, content: queued.content, images: queued.images, replyTo: null }
  }

  async function steerQueued(botId: string, sender: TurnSender, queued: QueuedMessage) {
    await input.runtime.steer(botId, { content: queued.content, images: queued.images }).then(() => {
      sender.person(queuedIncoming(queued))
    }).catch((error: unknown) => {
      messageQueue.restore(botId, queued)
      input.observability.event({ name: "conversation.steerfailed", context: { botId }, error })
    })

    publishQueue(botId)
  }

  async function flushQueue(botId: string) {
    const sender = active.get(botId)?.sender

    if (!sender) {
      return
    }

    for (const message of messageQueue.list(botId).filter((queued) => queued.promoted)) {
      const queued = messageQueue.take(botId, message.id)

      if (queued) {
        await steerQueued(botId, sender, queued)
      }
    }
  }

  async function drainQueue(botId: string) {
    if (shutdown.signal.aborted || stopping.has(botId) || active.has(botId)) {
      return
    }

    const [next] = messageQueue.list(botId)

    if (!next) {
      return
    }

    const bot = input.bots.get({ id: botId })

    if (!bot || bot.closed) {
      messageQueue.clear(botId)
      publishQueue(botId)

      return
    }

    const taken = messageQueue.take(botId, next.id)

    if (!taken) {
      return
    }

    publishQueue(botId)
    await runTurn(botId, queuedIncoming(taken)).catch((error: unknown) => {
      messageQueue.restore(botId, taken)
      publishQueue(botId)
      input.observability.event({ name: "conversation.queuefailed", context: { botId }, error })
    })
  }

  async function runTurn(botId: string, message: IncomingMessage, options?: { routine?: RoutineCall; trigger?: TriggerCall; signal?: AbortSignal }) {
    const requestedSignal = options?.signal ? AbortSignal.any([shutdown.signal, options.signal]) : shutdown.signal
    const turn = await claim(botId, message, requestedSignal)
    const { signal } = turn
    let context: TurnContext

    try {
      if (signal.aborted) {
        throw new Error("The person interrupted you before that Bot started")
      }

      context = contextFor(turn.message, options)
      await open(botId)
      signal.throwIfAborted()
      input.database.conversations.append(turn.message)
    } catch (error) {
      turn.release()

      throw error
    }

    const interrupt = () => {
      void input.runtime.abort(botId).catch((error: unknown) => {
        input.observability.event({ name: "conversation.abortfailed", context: { botId }, error })
      })
    }
    signal.addEventListener("abort", interrupt, { once: true })

    const completion = Promise.withResolvers<TurnResult>()
    let finished = false
    const responses: string[] = []
    let responseBytes = 0
    let terminalMessageFinished = false
    const activity = createConversationActivityRecorder(turn.message.id, incoming(turn.message))
    let eventCount = 0
    let receivedFirstEvent = false
    let unsubscribe = () => {}
    turn.sender = { bot: (content, question) => publishMessage(content, null, undefined, question), person: publishIncoming }
    input.observability.event({ name: "conversation.started", context: { botId } })
    unsubscribe = input.runtime.subscribe(botId, (runtimeEvent) => {
      if ((runtimeEvent.type === "tool-started" || runtimeEvent.type === "tool-finished") && (runtimeEvent.tool === askTool || runtimeEvent.tool === sendMessageTool)) {
        eventCount++

        return
      }

      eventCount++

      if (!receivedFirstEvent) {
        receivedFirstEvent = true
        input.observability.event({ name: "conversation.firstevent", context: { botId } })
        void flushQueue(botId).catch((error: unknown) => {
          input.observability.event({ name: "conversation.steerfailed", context: { botId }, error })
        })
      }

      if (runtimeEvent.type === "text") {
        return
      }

      const deliveredEvent = activity.record(runtimeEvent)

      if (deliveredEvent.type === "message-finished") {
        const ending = runtimeEvent.type === "message-finished" && runtimeEvent.reason ? turnEndings[runtimeEvent.reason] : null
        const error = runtimeEvent.type === "message-finished" ? runtimeEvent.error : undefined

        if (ending) {
          publishMessage("", ending, error)
        }
        terminalMessageFinished = ending !== null

        return
      }

      if (deliveredEvent.type === "finished") {
        if (deliveredEvent.reason === "stop" && responses.length === 0) {
          const error = "O Bot terminou sem enviar uma mensagem. Tente novamente."

          finish("error", error)
          deliver(botId, { type: "finished", reason: "error", error })

          return
        }

        finish(deliveredEvent.reason, deliveredEvent.error)
      }

      deliver(botId, deliveredEvent)
    })
    void input.runtime.prompt(botId, { content: message.content, images: message.images, context }).catch((error) => {
      if (finished) {
        return
      }

      const event = { type: "finished", reason: "error", error: describeError(error) } as const

      finish(event.reason, event.error)
      deliver(botId, event)
    })

    function finish(reason: FinishReason, error?: unknown) {
      if (finished) {
        return
      }

      const ending = turnEndings[reason]
      const errorMessage = reason === "error" ? describeError(error) : undefined

      if (!terminalMessageFinished && ending) {
        publishMessage("", ending, errorMessage)
      }

      finished = true
      input.observability.event({
        name: "conversation.finished",
        attributes: { state: reason, count: eventCount, bytes: responseBytes },
        context: { botId },
        ...(error ? { error } : {}),
      })
      turn.release()
      unsubscribe()
      signal.removeEventListener("abort", interrupt)
      completion.resolve({ reason, response: responses.join("\n\n"), ...(errorMessage ? { error: errorMessage } : {}) })
    }

    function publishIncoming(incoming: IncomingMessage) {
      const message: ConversationMessage = { id: crypto.randomUUID(), botId, ...incoming, taskId: turn.message.taskId, triggerRunId: turn.message.triggerRunId, question: null, activity: null, ending: null, createdAt: new Date().toISOString() }

      input.database.conversations.append(message)

      const event: ConversationEvent = { type: "message-finished", message }

      deliver(botId, event)
    }

    function publishMessage(content: string, ending: TurnEnding | null, error?: string, question: MessageQuestion | null = null) {
      const message: ConversationMessage = {
        id: crypto.randomUUID(),
        botId,
        author: "bot",
        authorBotId: botId,
        taskId: turn.message.taskId,
        triggerRunId: turn.message.triggerRunId,
        content,
        images: [],
        question,
        replyTo: null,
        activity: activity.takeSnapshot(),
        ending,
        ...(error ? { error } : {}),
        createdAt: new Date().toISOString(),
      }

      try {
        input.database.conversations.append(message)
      } catch (persistError) {
        input.observability.event({ name: "conversation.persistencefailed", context: { botId }, error: persistError })

        if (content) {
          throw persistError
        }
      }

      if (content) {
        responses.push(content)
      }

      responseBytes += Buffer.byteLength(content)

      const event: ConversationEvent = { type: "message-finished", message }

      deliver(botId, event)

      return message
    }

    void completion.promise.then(async (result) => {
      if (result.reason === "stop") {
        await drainQueue(botId)
      }
    }).catch((error: unknown) => {
      input.observability.event({ name: "conversation.queuefailed", context: { botId }, error })
    })

    return { finished: completion.promise }
  }

  function resolveReplyContent(botId: string, replyTo: MessageReply) {
    const questionMessage = input.database.conversations.get(replyTo.messageId)

    if (!questionMessage?.question || questionMessage.botId !== botId || questionMessage.author !== "bot") {
      throw new Error("Question option is no longer available")
    }

    if (answering.has(replyTo.messageId) || input.database.conversations.replied(replyTo.messageId)) {
      throw new Error("Esta Pergunta já foi respondida.")
    }

    const { question } = questionMessage
    const values = new Set(replyTo.optionValues)
    const chosen = question.options.filter((option) => values.has(option.value))

    if (chosen.length !== replyTo.optionValues.length) {
      throw new Error("Question option is no longer available")
    }

    if (!question.multiple && chosen.length > 1) {
      throw new Error("Question accepts a single option")
    }

    answering.add(replyTo.messageId)

    return chosen.map((option) => option.label).join(", ")
  }

  async function accept(botId: string, message: IncomingMessage, delivery: "queue" | "now") {
    const { content, images, replyTo } = message

    if (!active.has(botId)) {
      await runTurn(botId, message)

      return
    }

    const sender = active.get(botId)?.sender
    const immediate = delivery === "now" || !!replyTo

    if (immediate && sender) {
      await input.runtime.steer(botId, { content, images })
      sender.person(message)

      return
    }

    const queued = messageQueue.add(botId, { content, images })

    if (immediate) {
      messageQueue.promote(botId, queued.id)
    }

    publishQueue(botId)
  }

  function teamBotIds(rawInput: unknown) {
    const { botId } = parse(conversationSchemas.botInput, rawInput)
    const leader = input.bots.get({ id: botId })

    if (!leader || leader.leaderBotId) {
      throw new Error("Escolha o Líder para acompanhar o trabalho do time.")
    }

    return new Set([leader.id, ...input.bots.list().filter((bot) => bot.leaderBotId === leader.id).map((bot) => bot.id)])
  }

  return {
    teamWorking(rawInput: unknown) {
      const botIds = teamBotIds(rawInput)

      return [...botIds].some((id) => active.has(id)) || delegation.hasWork(botIds)
    },
    overview() {
      return input.database.conversations.overview()
    },
    history(rawInput: unknown) {
      const { botId, ...page } = parse(conversationSchemas.historyInput, rawInput)

      if (!input.bots.get({ id: botId })) {
        throw new Error("Bot not found")
      }

      return input.database.conversations.history(botId, page)
    },
    related(rawInput: unknown) {
      const { taskId } = parse(conversationSchemas.taskInput, rawInput)

      if (!input.tasks.get(taskId)) {
        throw new Error("Tarefa not found")
      }

      return input.database.conversations.related(taskId)
    },
    events(signal?: AbortSignal) {
      signal?.throwIfAborted()
      const initial = Array.from(active).flatMap(([botId, turn]): BotConversationEvent[] => [
        { botId, event: { type: "started", messageId: turn.message.id, message: incoming(turn.message) } },
        ...input.runtime.pending(botId).map((request): BotConversationEvent => ({ botId, event: { type: "permission-requested", request } })),
        ...extensions.flatMap((extension) => extension.pending?.(botId) ?? []).map((event): BotConversationEvent => ({ botId, event })),
      ])
      const queued = messageQueue.all().map(([botId, messages]): BotConversationEvent => ({ botId, event: { type: "queue-changed", queued: messages } }))
      const queue = createQueue<BotConversationEvent>({
        initial: [...initial, ...queued],
        ...(signal ? { signal } : {}),
        onClose: () => streams.delete(queue),
      })
      streams.add(queue)

      return queue
    },
    active(botId: string) {
      return active.get(botId)?.message
    },
    notify(botId: string, event: ConversationEvent) {
      deliver(botId, event)
    },
    addTools(botId: string, tools: PiTool[]) {
      input.runtime.addTools(botId, tools)
    },
    async compact(rawInput: unknown) {
      shutdown.signal.throwIfAborted()
      const { botId, instructions } = parse(conversationSchemas.compactInput, rawInput)

      if (active.has(botId)) {
        throw new Error("Bot is already working")
      }

      if (compactions.has(botId)) {
        throw new Error("Bot is already compacting its Context")
      }

      const { promise: settled, resolve: settle } = Promise.withResolvers<void>()
      compactions.set(botId, settled)

      try {
        await open(botId)

        return await input.runtime.compact(botId, instructions)
      } finally {
        compactions.delete(botId)
        settle()
      }
    },
    async send(rawInput: unknown) {
      const { botId, content, images, replyTo, mentionedBotIds, deliver: delivery } = parse(conversationSchemas.sendInput, rawInput)
      const empty = content.length === 0 && images.length === 0 && !replyTo

      if (empty) {
        throw new Error("Message is empty")
      }

      const resolvedContent = replyTo ? resolveReplyContent(botId, replyTo) : content

      for (const mentionedBotId of mentionedBotIds) {
        input.bots.addColleague(botId, mentionedBotId)
      }

      try {
        await accept(botId, { author: "person", authorBotId: null, taskId: null, triggerRunId: null, content: resolvedContent, images, replyTo }, delivery)
      } finally {
        if (replyTo) {
          answering.delete(replyTo.messageId)
        }
      }
    },
    async promote(rawInput: unknown) {
      const { botId, id } = parse(conversationSchemas.queueInput, rawInput)

      if (!messageQueue.promote(botId, id)) {
        throw new Error("Message is not in the Fila")
      }

      publishQueue(botId)

      if (!active.has(botId)) {
        await drainQueue(botId)

        return
      }

      await flushQueue(botId)
    },
    async unqueue(rawInput: unknown) {
      const { botId, id } = parse(conversationSchemas.queueInput, rawInput)

      if (!messageQueue.take(botId, id)) {
        throw new Error("Message is not in the Fila")
      }

      publishQueue(botId)
    },
    async call(routine: RoutineCall) {
      await runTurn(routine.botId, { author: "routine", authorBotId: null, taskId: null, triggerRunId: null, content: routine.content, images: [], replyTo: null }, { routine })
    },
    async callTrigger(call: TriggerCall) {
      const message: IncomingMessage = { author: "trigger", authorBotId: null, taskId: null, triggerRunId: call.run.id, content: call.trigger.instruction, images: [], replyTo: null }
      const turn = await runTurn(call.trigger.botId, message, { trigger: call })
      const finished = await turn.finished

      if (finished.reason !== "stop") {
        throw new Error(finished.error ?? "Gatilho turn did not finish")
      }
    },
    async abort(rawInput: unknown) {
      const { botId } = parse(conversationSchemas.botInput, rawInput)

      const turn = active.get(botId)

      if (!turn) {
        throw new Error("Bot is not working")
      }

      await turn.abort()
    },
    async abortTeam(rawInput: unknown) {
      const botIds = teamBotIds(rawInput)

      if ([...botIds].some((id) => stopping.has(id))) {
        throw new Error("O trabalho do time já está sendo interrompido.")
      }

      for (const id of botIds) {
        stopping.add(id)
      }

      try {
        await Promise.all([delegation.abortFor(botIds), ...[...botIds].map(async (id) => {
          await active.get(id)?.abort()
        })])
      } finally {
        for (const id of botIds) {
          stopping.delete(id)
        }
      }
    },
    async close(botId: string) {
      messageQueue.clear(botId)
      await compactions.get(botId)
      const current = active.get(botId)

      if (current) {
        await current.abort()
      }

      input.runtime.close(botId)
      sessions.delete(botId)
    },
    async dispose() {
      shutdown.abort()
      await Promise.allSettled([...active.values()].map((turn) => turn.settled).concat([...compactions.values()]))
      input.runtime.dispose()
      sessions.clear()
      active.clear()
      compactions.clear()

      for (const stream of streams) {
        stream.close()
      }

      streams.clear()
    },
  }
}
