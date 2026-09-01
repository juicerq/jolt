import type { createBots } from "../bots/bots"
import type { Observability } from "../observability/observability"
import type { createPiAgentRuntime } from "../pi/pi-agent-runtime"
import type { AppDatabase } from "../persistence/database"
import type { createTasks } from "../tasks/tasks"
import { conversationSchemas, type ConversationEvent, type ConversationMessage } from "../../shared/conversations"
import { createConversationActivityRecorder } from "./conversation-activity"
import { createDelegation } from "./delegation"

const defaultTools = ["read", "bash", "edit", "write"]

type IncomingMessage = Pick<ConversationMessage, "author" | "authorBotId" | "taskId" | "content">
type ActiveTurn = { author: ConversationMessage["author"]; taskId: string | null; settled: Promise<void> }

export function createConversations(input: {
  database: AppDatabase
  bots: ReturnType<typeof createBots>
  tasks: ReturnType<typeof createTasks>
  runtime: ReturnType<typeof createPiAgentRuntime>
  observability: Observability
}) {
  const opened = new Set<string>()
  const active = new Map<string, ActiveTurn>()
  const delegation = createDelegation({ bots: input.bots, tasks: input.tasks, observability: input.observability, runTurn, active: (botId) => active.get(botId) })

  async function open(botId: string) {
    if (opened.has(botId)) {
      return
    }

    const bot = input.bots.get({ id: botId })

    if (!bot) {
      throw new Error("Bot not found")
    }

    const cwd = await input.bots.resolveWorkingDirectory({ id: botId })
    const sessionFile = input.database.conversations.sessionFile(botId)
    const customTools = delegation.tools(bot)
    const tools = [...defaultTools, ...customTools.map((tool) => tool.name)]
    const result = await input.runtime.open({
      botId,
      cwd,
      tools,
      grants: new Set(tools),
      customTools,
      instructions: [
        `You are ${bot.name}.`,
        `Expected outcome: ${bot.function.outcome}`,
        `Responsibilities: ${bot.function.responsibilities}`,
        `Limits: ${bot.function.limits}`,
        `Delivery: ${bot.function.delivery}`,
        delegation.instructions(bot),
      ].filter(Boolean).join("\n"),
      ...(sessionFile ? { sessionFile } : {}),
    })

    if (result.sessionFile) {
      input.database.conversations.saveSessionFile(botId, result.sessionFile)
    }

    opened.add(botId)
  }

  async function claim(botId: string, message: IncomingMessage) {
    const current = active.get(botId)
    const personOverridesBot = message.author === "person" && current?.author === "bot"

    if (current && !personOverridesBot) {
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
    active.set(botId, { author: message.author, taskId: message.taskId ?? current?.taskId ?? null, settled })

    return {
      taskId: message.taskId ?? current?.taskId ?? null,
      release() {
        active.delete(botId)
        settle()
      },
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

    const queued: ConversationEvent[] = []
    let wake: (() => void) | undefined
    let finished = false
    let response = ""
    const activity = createConversationActivityRecorder()
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

      queued.push(deliveredEvent)
      wake?.()
      wake = undefined
    })
    void input.runtime.prompt(botId, message.content).catch((error) => {
      if (!finished) {
        queued.push({ type: "finished", reason: "error" })
        finished = true
        turn.release()
        unsubscribe()
        input.observability.event({
          name: "conversation.finished",
          attributes: { state: "error", count: eventCount, bytes: Buffer.byteLength(response) },
          context: { botId, provider: "codex" },
          error,
        })
        wake?.()
        wake = undefined
      }
    })

    try {
      while (!finished || queued.length > 0) {
        if (queued.length === 0) {
          await new Promise<void>((resolve) => {
            wake = resolve
          })
        }

        const event = queued.shift()

        if (event) {
          yield event
        }
      }
    } finally {
      wake = undefined
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
    send(rawInput: unknown) {
      const { botId, content } = conversationSchemas.sendInput.assert(rawInput)

      return runTurn(botId, { author: "person", authorBotId: null, taskId: null, content })
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
      opened.clear()
      active.clear()
    },
  }
}
