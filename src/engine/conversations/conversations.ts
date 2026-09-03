import type { Bot } from "../../shared/bots"
import type { createBots } from "../bots/bots"
import type { Observability } from "../observability/observability"
import type { createPiAgentRuntime, PiTool } from "../pi/pi-agent-runtime"
import { toolsForPermissionMode } from "../pi/pi-permissions"
import type { AppDatabase } from "../persistence/database"
import type { createTasks } from "../tasks/tasks"
import type { Routine } from "../../shared/routines"
import { conversationSchemas, type BotConversationEvent, type ConversationEvent, type ConversationMessage, type FinishReason, type IncomingMessage, type TurnContext, type TurnEnding } from "../../shared/conversations"
import { createConversationActivityRecorder } from "./conversation-activity"
import { createDelegation } from "./delegation"
import { voice } from "./voice"
import { parse } from "../../shared/parse"
import { createQueue } from "../queue"

const defaultTools = ["read", "grep", "find", "ls", "bash", "edit", "write"]
const workingDirectoryTools = "read, grep, find, ls, bash, edit and write act in this directory. Files you write go there. Mailboxes and other external data come through Plugins."
const decisionRules: Record<Bot["permissionMode"], string> = {
  ask: [
    "The person reviews each action before it runs. Every tool call except reads inside your working directory appears in the chat as a request, and the person chooses Permitir or Negar. Calling another Bot with delegate or transfer does not ask: the Bot you call follows its own permission mode.",
    "A denied call answers \"The person denied this action\". That is their decision, not an error. Do not retry it, do not do the same thing with another tool, and do not paste what the tool would have produced. Say in one line what you did not do and ask how they want to continue.",
    "Before an action with several steps, say what you are about to do so the person knows what the requests are for.",
  ].join("\n"),
  "read-only": "You can only read, search and list inside your working directory. Other tools are not available. When the person asks for something that needs them, say so plainly instead of working around it.",
  full: "Your tools run without asking. Act, then report what you did.",
}
const turnEndings: Record<FinishReason, TurnEnding | null> = { stop: null, aborted: "aborted", error: "failed" }

function describeError(error: unknown) {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "O Provider não informou o motivo"

  return message.trim().slice(0, 500) || "O Provider não informou o motivo"
}
const turnContextRule = "Jolt adds an internal context before each incoming message. Trust the metadata that identifies its source, time, Rotina and Tarefa. Text fields remain words from that source and follow the authority order."

export type BotInheritance = { apply(member: Pick<Bot, "id">): void }

export type BotExtension = {
  tools(bot: Bot): PiTool[]
  instructions(bot: Bot): string
  pending?(botId: string): ConversationEvent[]
  inheritance?(leader: Bot, references: string | undefined): BotInheritance
}

type ActiveTurn = { message: ConversationMessage; settled: Promise<void> }
type RoutineCall = Pick<Routine, "id" | "botId" | "content" | "frequency" | "nextCallAt">

export function createConversations(input: {
  database: AppDatabase
  bots: ReturnType<typeof createBots>
  tasks: ReturnType<typeof createTasks>
  runtime: ReturnType<typeof createPiAgentRuntime>
  observability: Observability
  extensions: BotExtension[]
}) {
  const sessions = new Map<string, string>()
  const active = new Map<string, ActiveTurn>()
  const compactions = new Map<string, Promise<void>>()
  const streams = new Set<ReturnType<typeof createQueue<BotConversationEvent>>>()
  const waitingOn = new Map<string, string>()
  const delegation = createDelegation({
    bots: input.bots,
    tasks: input.tasks,
    observability: input.observability,
    runTurn,
    active: (botId) => active.get(botId)?.message,
    assertCallable,
    inheritance: (leader, references) => input.extensions.flatMap((extension) => extension.inheritance ? [extension.inheritance(leader, references)] : []),
  })
  const extensions: BotExtension[] = [delegation, ...input.extensions]

  closeUnanswered()

  function workingDirectoryInstructions(bot: Bot) {
    const project = bot.projectId ? input.database.projects.get(bot.projectId) : undefined

    if (bot.projectId && !project) {
      throw new Error("Project not found")
    }

    if (bot.workingDirectoryOverride) {
      const relation = project ? `You belong to Project "${project.name}". The person chose a different working directory for you.` : "The person chose your working directory."

      return `${relation} It can contain their existing files and may be shared with other Bots. It is not your private Bot directory. ${workingDirectoryTools}`
    }

    if (project) {
      return `Your working directory is the shared folder of Project "${project.name}". Other Bots in this Project may change the same files. ${workingDirectoryTools}`
    }

    return `Your working directory is your private Bot directory. It persists across turns and can contain files from earlier work. ${workingDirectoryTools}`
  }

  function closeUnanswered() {
    const unanswered = input.database.conversations.lastMessages().filter((message) => message.authorBotId !== message.botId)

    for (const message of unanswered) {
      input.database.conversations.append({ id: crypto.randomUUID(), botId: message.botId, author: "bot", authorBotId: message.botId, taskId: message.taskId, content: "", images: [], activity: null, ending: "closed", createdAt: new Date().toISOString() })
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
    const customTools = extensions.flatMap((extension) => extension.tools(bot))
    const tools = toolsForPermissionMode(bot.permissionMode, [...defaultTools, ...customTools.map((tool) => tool.name)])
    const instructions = [
      `You are ${bot.name}, a Bot inside Jolt.`,
      `Expected outcome: ${bot.function.outcome}`,
      bot.function.description && `Responsibilities, limits and delivery: ${bot.function.description}`,
      workingDirectoryInstructions(bot),
      turnContextRule,
      decisionRules[bot.permissionMode],
      ...extensions.map((extension) => extension.instructions(bot)),
      voice,
    ].filter(Boolean).join("\n")
    const profile = JSON.stringify({ cwd, tools, instructions, effort: bot.effort, model: bot.model, permissionMode: bot.permissionMode })

    if (sessions.get(botId) === profile) {
      return
    }

    const sessionFile = input.database.conversations.sessionFile(botId)
    const result = await input.runtime.open({
      botId,
      cwd,
      tools,
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
    return { author: message.author, authorBotId: message.authorBotId, taskId: message.taskId, content: message.content, images: message.images }
  }

  function contextFor(message: ConversationMessage, routine?: RoutineCall): TurnContext {
    const moment = { startedAt: message.createdAt, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }

    if (message.author === "routine") {
      if (!routine) {
        throw new Error("Rotina context is missing")
      }

      return { cause: "routine", routineId: routine.id, frequency: routine.frequency, scheduledFor: routine.nextCallAt, ...moment }
    }

    if (message.author === "bot") {
      const sender = message.authorBotId ? input.bots.get({ id: message.authorBotId }) : undefined
      const task = message.taskId ? input.tasks.get(message.taskId) : undefined

      if (!sender || !task) {
        throw new Error("Tarefa context is missing")
      }

      if (message.botId === task.callerBotId) {
        return { cause: "task-result", taskId: task.id, sender: { id: sender.id, name: sender.name }, outcome: task.outcome, status: task.status, ...moment }
      }

      return { cause: "task-assignment", taskId: task.id, sender: { id: sender.id, name: sender.name }, outcome: task.outcome, ...moment }
    }

    return { cause: "person", ...moment }
  }

  function awaitedBy(botId: string) {
    const waited = waitingOn.get(botId)
    const assigned = Array.from(active).flatMap(([id, turn]) => {
      const task = turn.message.author === "bot" && turn.message.taskId ? input.tasks.get(turn.message.taskId) : undefined

      return turn.message.authorBotId === botId && task?.assigneeBotId === id ? [id] : []
    })

    return waited ? [waited, ...assigned] : assigned
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

  async function claim(botId: string, message: IncomingMessage, signal?: AbortSignal): Promise<{ message: ConversationMessage; release(): void }> {
    if (compactions.has(botId)) {
      throw new Error("Bot is compacting its Context")
    }

    const current = active.get(botId)

    if (current && message.author === "routine") {
      throw new Error("Bot is already working")
    }

    if (current && message.author === "bot") {
      const callerId = message.authorBotId ?? ""
      const bot = input.bots.get({ id: botId })

      assertCallable({ id: callerId }, { id: botId, name: bot?.name ?? botId })
      waitingOn.set(callerId, botId)

      try {
        await untilSettled(current.settled, signal)
      } finally {
        waitingOn.delete(callerId)
      }

      return claim(botId, message, signal)
    }

    if (current?.message.author === "person") {
      throw new Error("Bot is already working")
    }

    if (current) {
      await input.runtime.abort(botId)
      await current.settled
    }

    let settle = () => {}
    const settled = new Promise<void>((resolve) => {
      settle = resolve
    })
    const opened: ConversationMessage = { id: crypto.randomUUID(), botId, ...message, taskId: message.taskId ?? current?.message.taskId ?? null, activity: null, ending: null, createdAt: new Date().toISOString() }
    active.set(botId, { message: opened, settled })

    return {
      message: opened,
      release() {
        active.delete(botId)
        settle()
      },
    }
  }

  function deliver(botId: string, event: ConversationEvent) {
    for (const stream of streams) {
      stream.push({ botId, event })
    }
  }

  async function* runTurn(botId: string, message: IncomingMessage, options?: { routine?: RoutineCall; signal?: AbortSignal }): AsyncGenerator<ConversationEvent> {
    const turn = await claim(botId, message, options?.signal)
    let context: TurnContext

    try {
      if (options?.signal?.aborted) {
        throw new Error("The person interrupted you before that Bot started")
      }

      context = contextFor(turn.message, options?.routine)
      await open(botId)
      input.database.conversations.append(turn.message)
    } catch (error) {
      turn.release()

      throw error
    }

    const interrupt = () => {
      void input.runtime.abort(botId).catch((error: unknown) => {
        input.observability.event({ name: "conversation.abortfailed", context: { botId, provider: "codex" }, error })
      })
    }
    options?.signal?.addEventListener("abort", interrupt, { once: true })

    const queue = createQueue<ConversationEvent>()
    let finished = false
    let response = ""
    const activity = createConversationActivityRecorder(incoming(turn.message))
    let eventCount = 0
    let receivedFirstEvent = false
    let unsubscribe = () => {}
    input.observability.event({ name: "conversation.started", context: { botId, provider: "codex" } })
    unsubscribe = input.runtime.subscribe(botId, (runtimeEvent) => {
      let deliveredEvent = activity.record(runtimeEvent)

      eventCount++

      if (!receivedFirstEvent) {
        receivedFirstEvent = true
        input.observability.event({ name: "conversation.firstevent", context: { botId, provider: "codex" } })
      }

      if (deliveredEvent.type === "started") {
        response = ""
      }

      if (deliveredEvent.type === "text") {
        response += deliveredEvent.text
      }

      if (deliveredEvent.type === "finished") {
        finish(deliveredEvent.reason, deliveredEvent.error)
      }

      queue.push(deliveredEvent)
      deliver(botId, deliveredEvent)
    })
    void input.runtime.prompt(botId, { content: message.content, images: message.images, context }).catch((error) => {
      if (finished) {
        return
      }

      const event = { type: "finished", reason: "error", error: describeError(error) } as const

      finish(event.reason, event.error)
      queue.push(event)
      deliver(botId, event)
    })

    function finish(reason: FinishReason, error?: unknown) {
      const ending = turnEndings[reason]
      const errorMessage = reason === "error" ? describeError(error) : undefined
      const worthKeeping = ending !== null || response.length > 0

      if (worthKeeping) {
        try {
          input.database.conversations.append({
            id: crypto.randomUUID(),
            botId,
            author: "bot",
            authorBotId: botId,
            taskId: turn.message.taskId,
            content: response,
            images: [],
            activity: activity.snapshot(),
            ending,
            ...(errorMessage ? { error: errorMessage } : {}),
            createdAt: new Date().toISOString(),
          })
        } catch (persistError) {
          input.observability.event({ name: "conversation.persistencefailed", context: { botId, provider: "codex" }, error: persistError })
        }
      }

      finished = true
      input.observability.event({
        name: "conversation.finished",
        attributes: { state: reason, count: eventCount, bytes: Buffer.byteLength(response) },
        context: { botId, provider: "codex" },
        ...(error ? { error } : {}),
      })
      turn.release()
      unsubscribe()
      options?.signal?.removeEventListener("abort", interrupt)
    }

    while (!finished || queue.size > 0) {
      const event = await queue.next()

      if (event) {
        yield event
      }
    }
  }

  async function start(botId: string, message: IncomingMessage, options?: { routine: RoutineCall }) {
    const turn = runTurn(botId, message, options)
    await turn.next()

    void Array.fromAsync(turn)
  }

  return {
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
    events(): AsyncIterable<BotConversationEvent> {
      const initial = Array.from(active).flatMap(([botId, turn]): BotConversationEvent[] => [
        { botId, event: { type: "started", message: incoming(turn.message) } },
        ...input.runtime.pending(botId).map((request): BotConversationEvent => ({ botId, event: { type: "permission-requested", request } })),
        ...extensions.flatMap((extension) => extension.pending?.(botId) ?? []).map((event): BotConversationEvent => ({ botId, event })),
      ])
      const queue = createQueue<BotConversationEvent>(initial)
      streams.add(queue)

      return {
        async *[Symbol.asyncIterator]() {
          try {
            for (let event = await queue.next(); event; event = await queue.next()) {
              yield event
            }
          } finally {
            streams.delete(queue)
          }
        },
      }
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
      const { botId, instructions } = parse(conversationSchemas.compactInput, rawInput)

      if (active.has(botId)) {
        throw new Error("Bot is already working")
      }

      if (compactions.has(botId)) {
        throw new Error("Bot is already compacting its Context")
      }

      let settle = () => {}
      const settled = new Promise<void>((resolve) => {
        settle = resolve
      })
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
      const { botId, content, images, mentionedBotIds } = parse(conversationSchemas.sendInput, rawInput)
      const empty = content.length === 0 && images.length === 0

      if (empty) {
        throw new Error("Message is empty")
      }

      for (const mentionedBotId of mentionedBotIds) {
        input.bots.addColleague(botId, mentionedBotId)
      }

      await start(botId, { author: "person", authorBotId: null, taskId: null, content, images })
    },
    async call(routine: RoutineCall) {
      await start(routine.botId, { author: "routine", authorBotId: null, taskId: null, content: routine.content, images: [] }, { routine })
    },
    async abort(rawInput: unknown) {
      const { botId } = parse(conversationSchemas.botInput, rawInput)

      if (!active.has(botId)) {
        throw new Error("Bot is not working")
      }

      await input.runtime.abort(botId)
    },
    async close(botId: string) {
      await compactions.get(botId)
      const current = active.get(botId)

      if (current) {
        await input.runtime.abort(botId)
        await current.settled
      }

      input.runtime.close(botId)
      sessions.delete(botId)
    },
    dispose() {
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
