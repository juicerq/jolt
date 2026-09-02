import type { Bot } from "../../shared/bots"
import type { createBots } from "../bots/bots"
import type { Observability } from "../observability/observability"
import type { createPiAgentRuntime, PiCustomTool } from "../pi/pi-agent-runtime"
import { toolsForPermissionMode } from "../pi/pi-permissions"
import type { AppDatabase } from "../persistence/database"
import type { createTasks } from "../tasks/tasks"
import { conversationSchemas, type BotConversationEvent, type ConversationEvent, type ConversationMessage, type FinishReason, type IncomingMessage, type TurnEnding } from "../../shared/conversations"
import { createConversationActivityRecorder } from "./conversation-activity"
import { createDelegation } from "./delegation"
import { voice } from "./voice"
import { parse } from "../../shared/parse"

const defaultTools = ["read", "grep", "find", "ls", "bash", "edit", "write"]
const turnEndings: Record<FinishReason, TurnEnding | null> = { stop: null, aborted: "aborted", error: "failed" }

export type BotExtension = {
  tools(bot: Bot): PiCustomTool[]
  instructions(bot: Bot): string
}

type ActiveTurn = { message: ConversationMessage; settled: Promise<void> }

function createQueue<T>(initial: T[] = []) {
  const items = initial
  let wake: (() => void) | undefined
  let closed = false

  function notify() {
    wake?.()
    wake = undefined
  }

  return {
    get size() {
      return items.length
    },
    push(item: T) {
      items.push(item)
      notify()
    },
    close() {
      closed = true
      notify()
    },
    async next() {
      if (items.length === 0 && !closed) {
        await new Promise<void>((resolve) => {
          wake = resolve
        })
      }

      return items.shift()
    },
  }
}

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
  const streams = new Set<ReturnType<typeof createQueue<BotConversationEvent>>>()
  const delegation = createDelegation({ bots: input.bots, tasks: input.tasks, observability: input.observability, runTurn, active: (botId) => active.get(botId)?.message })
  const extensions = [delegation, ...input.extensions]

  closeUnanswered()

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
      `You are ${bot.name}.`,
      `Expected outcome: ${bot.function.outcome}`,
      bot.function.description && `Responsibilities, limits and delivery: ${bot.function.description}`,
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

  async function claim(botId: string, message: IncomingMessage): Promise<{ message: ConversationMessage; release(): void }> {
    const current = active.get(botId)

    if (current && message.author === "routine") {
      throw new Error("Bot is already working")
    }

    if (current && message.author === "bot") {
      await current.settled

      return claim(botId, message)
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

  async function* runTurn(botId: string, message: IncomingMessage): AsyncGenerator<ConversationEvent> {
    const turn = await claim(botId, message)

    try {
      await open(botId)
      input.database.conversations.append(turn.message)
    } catch (error) {
      turn.release()

      throw error
    }

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
        finish(deliveredEvent.reason)
      }

      queue.push(deliveredEvent)
      deliver(botId, deliveredEvent)
    })
    void input.runtime.prompt(botId, message).catch((error) => {
      if (finished) {
        return
      }

      finish("error", error)
      queue.push({ type: "finished", reason: "error" })
      deliver(botId, { type: "finished", reason: "error" })
    })

    function finish(reason: FinishReason, error?: unknown) {
      const ending = turnEndings[reason]
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
    }

    while (!finished || queue.size > 0) {
      const event = await queue.next()

      if (event) {
        yield event
      }
    }
  }

  async function start(botId: string, message: IncomingMessage) {
    const turn = runTurn(botId, message)
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
    async send(rawInput: unknown) {
      const { botId, content, images } = parse(conversationSchemas.sendInput, rawInput)
      const empty = content.length === 0 && images.length === 0

      if (empty) {
        throw new Error("Message is empty")
      }

      await start(botId, { author: "person", authorBotId: null, taskId: null, content, images })
    },
    async call(botId: string, content: string) {
      await start(botId, { author: "routine", authorBotId: null, taskId: null, content, images: [] })
    },
    async abort(rawInput: unknown) {
      const { botId } = parse(conversationSchemas.botInput, rawInput)

      if (!active.has(botId)) {
        throw new Error("Bot is not working")
      }

      await input.runtime.abort(botId)
    },
    async close(botId: string) {
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

      for (const stream of streams) {
        stream.close()
      }

      streams.clear()
    },
  }
}
