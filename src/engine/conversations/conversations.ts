import type { createBots } from "../bots/bots"
import type { Observability } from "../observability/observability"
import type { createPiAgentRuntime } from "../pi/pi-agent-runtime"
import type { AppDatabase } from "../persistence/database"
import type { createTasks } from "../tasks/tasks"
import { conversationSchemas, type BotConversationEvent, type ConversationEvent, type IncomingMessage } from "../../shared/conversations"
import { createConversationActivityRecorder } from "./conversation-activity"
import { createDelegation } from "./delegation"

const defaultTools = ["read", "bash", "edit", "write"]

type ActiveTurn = { message: IncomingMessage; settled: Promise<void> }

function createQueue<T>(initial: T[] = []) {
  const items = initial
  let wake: (() => void) | undefined

  return {
    get size() {
      return items.length
    },
    push(item: T) {
      items.push(item)
      wake?.()
      wake = undefined
    },
    async next() {
      if (items.length === 0) {
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
}) {
  const sessions = new Map<string, string>()
  const active = new Map<string, ActiveTurn>()
  const listeners = new Set<(event: BotConversationEvent) => void>()
  const delegation = createDelegation({ bots: input.bots, tasks: input.tasks, observability: input.observability, runTurn, active: (botId) => active.get(botId)?.message })

  async function open(botId: string) {
    const bot = input.bots.get({ id: botId })

    if (!bot) {
      throw new Error("Bot not found")
    }

    const cwd = await input.bots.resolveWorkingDirectory({ id: botId })
    const customTools = delegation.tools(bot)
    const tools = [...defaultTools, ...customTools.map((tool) => tool.name)]
    const instructions = [
      `You are ${bot.name}.`,
      `Expected outcome: ${bot.function.outcome}`,
      `Responsibilities: ${bot.function.responsibilities}`,
      `Limits: ${bot.function.limits}`,
      `Delivery: ${bot.function.delivery}`,
      delegation.instructions(bot),
    ].filter(Boolean).join("\n")
    const profile = JSON.stringify({ cwd, tools, instructions })

    if (sessions.get(botId) === profile) {
      return
    }

    const sessionFile = input.database.conversations.sessionFile(botId)
    const result = await input.runtime.open({
      botId,
      cwd,
      tools,
      grants: new Set(tools),
      customTools,
      instructions,
      ...(sessionFile ? { sessionFile } : {}),
    })

    if (result.sessionFile) {
      input.database.conversations.saveSessionFile(botId, result.sessionFile)
    }

    sessions.set(botId, profile)
  }

  async function claim(botId: string, message: IncomingMessage): Promise<{ taskId: string | null; release(): void }> {
    const current = active.get(botId)

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
    const taskId = message.taskId ?? current?.message.taskId ?? null
    active.set(botId, { message: { ...message, taskId }, settled })

    return {
      taskId,
      release() {
        active.delete(botId)
        settle()
      },
    }
  }

  function deliver(botId: string, event: ConversationEvent) {
    for (const listener of listeners) {
      listener({ botId, event })
    }
  }

  async function* runTurn(botId: string, message: IncomingMessage): AsyncGenerator<ConversationEvent> {
    const turn = await claim(botId, message)
    const persisted = { ...message, taskId: turn.taskId }

    try {
      await open(botId)
      input.database.conversations.append({ id: crypto.randomUUID(), botId, ...persisted, activity: null, createdAt: new Date().toISOString() })
    } catch (error) {
      turn.release()

      throw error
    }

    const queue = createQueue<ConversationEvent>()
    let finished = false
    let response = ""
    const activity = createConversationActivityRecorder(persisted)
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
        let finishReason = deliveredEvent.reason

        if (deliveredEvent.reason === "stop" && response.length > 0) {
          try {
            input.database.conversations.append({
              id: crypto.randomUUID(),
              botId,
              author: "bot",
              authorBotId: botId,
              taskId: persisted.taskId,
              content: response,
              activity: activity.snapshot(),
              createdAt: new Date().toISOString(),
            })
          } catch (error) {
            finishReason = "error"
            input.observability.event({ name: "conversation.persistencefailed", context: { botId, provider: "codex" }, error })
          }
        }

        deliveredEvent = { type: "finished", reason: finishReason }
        finished = true
        input.observability.event({
          name: "conversation.finished",
          attributes: { state: finishReason, count: eventCount, bytes: Buffer.byteLength(response) },
          context: { botId, provider: "codex" },
        })
        turn.release()
        unsubscribe()
      }

      queue.push(deliveredEvent)
      deliver(botId, deliveredEvent)
    })
    void input.runtime.prompt(botId, message.content).catch((error) => {
      if (!finished) {
        queue.push({ type: "finished", reason: "error" })
        deliver(botId, { type: "finished", reason: "error" })
        finished = true
        turn.release()
        unsubscribe()
        input.observability.event({
          name: "conversation.finished",
          attributes: { state: "error", count: eventCount, bytes: Buffer.byteLength(response) },
          context: { botId, provider: "codex" },
          error,
        })
      }
    })

    while (!finished || queue.size > 0) {
      const event = await queue.next()

      if (event) {
        yield event
      }
    }
  }

  return {
    history(rawInput: unknown) {
      const { botId } = conversationSchemas.botInput.assert(rawInput)

      if (!input.bots.get({ id: botId })) {
        throw new Error("Bot not found")
      }

      return input.database.conversations.history(botId)
    },
    related(rawInput: unknown) {
      const { taskId } = conversationSchemas.taskInput.assert(rawInput)

      if (!input.tasks.get(taskId)) {
        throw new Error("Tarefa not found")
      }

      return input.database.conversations.related(taskId)
    },
    events(): AsyncIterable<BotConversationEvent> {
      const queue = createQueue<BotConversationEvent>(Array.from(active, ([botId, turn]) => ({ botId, event: { type: "started", message: turn.message } })))
      listeners.add(queue.push)

      return {
        async *[Symbol.asyncIterator]() {
          try {
            while (true) {
              const event = await queue.next()

              if (event) {
                yield event
              }
            }
          } finally {
            listeners.delete(queue.push)
          }
        },
      }
    },
    async send(rawInput: unknown) {
      const { botId, content } = conversationSchemas.sendInput.assert(rawInput)
      const turn = runTurn(botId, { author: "person", authorBotId: null, taskId: null, content })
      await turn.next()

      void Array.fromAsync(turn)
    },
    async abort(rawInput: unknown) {
      const { botId } = conversationSchemas.botInput.assert(rawInput)

      if (!active.has(botId)) {
        throw new Error("Bot is not working")
      }

      await input.runtime.abort(botId)
    },
    dispose() {
      input.runtime.dispose()
      sessions.clear()
      active.clear()
      listeners.clear()
    },
  }
}
