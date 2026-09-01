import type { createBots } from "../bots/bots"
import type { Observability } from "../observability/observability"
import type { createPiAgentRuntime } from "../pi/pi-agent-runtime"
import type { AppDatabase } from "../persistence/database"
import { conversationSchemas, type ConversationEvent, type ConversationMessage } from "../../shared/conversations"
import { createConversationActivityRecorder } from "./conversation-activity"

const defaultTools = ["read", "bash", "edit", "write"]

export function createConversations(input: {
  database: AppDatabase
  bots: ReturnType<typeof createBots>
  runtime: ReturnType<typeof createPiAgentRuntime>
  observability: Observability
}) {
  const opened = new Set<string>()
  const active = new Set<string>()

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
    const result = await input.runtime.open({
      botId,
      cwd,
      tools: defaultTools,
      grants: new Set(defaultTools),
      instructions: [
        `You are ${bot.name}.`,
        `Expected outcome: ${bot.function.outcome}`,
        `Responsibilities: ${bot.function.responsibilities}`,
        `Limits: ${bot.function.limits}`,
        `Delivery: ${bot.function.delivery}`,
      ].join("\n"),
      ...(sessionFile ? { sessionFile } : {}),
    })

    if (result.sessionFile) {
      input.database.conversations.saveSessionFile(botId, result.sessionFile)
    }

    opened.add(botId)
  }

  return {
    history(rawInput: unknown) {
      const { botId } = conversationSchemas.botInput.assert(rawInput)

      if (!input.bots.get({ id: botId })) {
        throw new Error("Bot not found")
      }

      return input.database.conversations.history(botId)
    },
    async *send(rawInput: unknown): AsyncGenerator<ConversationEvent> {
      const { botId, content } = conversationSchemas.sendInput.assert(rawInput)

      if (active.has(botId)) {
        throw new Error("Bot is already working")
      }

      active.add(botId)
      await open(botId).catch((error) => {
        active.delete(botId)

        throw error
      })
      const personMessage: ConversationMessage = {
        id: crypto.randomUUID(),
        botId,
        author: "person",
        content,
        activity: null,
        createdAt: new Date().toISOString(),
      }
      try {
        input.database.conversations.append(personMessage)
      } catch (error) {
        active.delete(botId)

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
          active.delete(botId)
          unsubscribe()
        }

        queued.push(deliveredEvent)
        wake?.()
        wake = undefined
      })
      void input.runtime.prompt(botId, content).catch((error) => {
        if (!finished) {
          queued.push({ type: "finished", reason: "error" })
          finished = true
          active.delete(botId)
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
