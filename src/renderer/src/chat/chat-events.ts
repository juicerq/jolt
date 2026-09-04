import type { QueryClient } from "@tanstack/react-query"
import type { BotConversationEvent, FinishReason } from "@src/shared/conversations"
import { findTeamBot } from "../bots/team"
import type { EngineClient } from "../engine-client"
import { createChatStreamBuffer } from "./chat-stream-buffer"
import {
  appendChatText,
  appendChatThinking,
  finishChatMessage,
  finishChatThinking,
  finishChatTool,
  requestChatPermission,
  requestChatPlugin,
  resolveChatPermission,
  resetChatQueues,
  resolveChatPlugin,
  setChatCompacting,
  setChatPluginStep,
  setChatQueue,
  settleChatRun,
  startChatRun,
  startChatThinking,
  startChatTool,
} from "./chat-store"
import { alertTurnFinished } from "./turn-alert"

const reconnectDelayMs = 1_000
const chunkFlushDelayMs = 100
const settledStatuses: Record<FinishReason, "available" | "completed" | "error"> = { stop: "completed", aborted: "available", error: "error" }

export function subscribeChatEvents({ client, queryClient }: { client: Pick<EngineClient, "query" | "raw">; queryClient: QueryClient }) {
  const controller = new AbortController()
  const chunks = createChatStreamBuffer({
    delayMs: chunkFlushDelayMs,
    flush(botId, kind, content) {
      if (kind === "text") {
        appendChatText(botId, content)
        return
      }

      appendChatThinking(botId, content)
    },
  })

  async function handle({ botId, event }: BotConversationEvent) {
    if (event.type === "text" || event.type === "thinking") {
      chunks.push(botId, event.type, event.text)
      return
    }

    chunks.drain(botId)

    if (event.type === "started") {
      startChatRun(botId, event.message)
      void invalidateTeam().catch(() => {})
      return
    }

    if (event.type === "message-finished") {
      finishChatMessage(botId, event.message)
      return
    }

    if (event.type === "thinking-started") {
      startChatThinking(botId)
      return
    }

    if (event.type === "thinking-finished") {
      finishChatThinking(botId, event.durationMs)
      return
    }

    if (event.type === "tool-started") {
      startChatTool(botId, event)
      return
    }

    if (event.type === "tool-finished") {
      finishChatTool(botId, event.callId, event.failed, event.error, event.denied)
      return
    }

    if (event.type === "compaction-started" || event.type === "compaction-finished") {
      setChatCompacting(botId, event.type === "compaction-started")
      return
    }

    if (event.type === "permission-requested") {
      requestChatPermission(botId, event.request)
      return
    }

    if (event.type === "permission-resolved") {
      resolveChatPermission(botId, event.requestId)
      return
    }

    if (event.type === "plugin-requested") {
      requestChatPlugin(botId, event.request)
      return
    }

    if (event.type === "plugin-step") {
      setChatPluginStep(botId, event.requestId, event.step)

      if (event.step.type === "browser") {
        void window.desktop.openInBrowser(event.step.url).catch(() => {})
      }

      return
    }

    if (event.type === "plugin-resolved") {
      resolveChatPlugin(botId, event.requestId)
      void queryClient.invalidateQueries({ queryKey: client.query.plugins.key() }).catch(() => {})
      return
    }

    if (event.type === "queue-changed") {
      setChatQueue(botId, event.queued)
      return
    }

    const projectsQuery = client.query.projects.list.queryOptions()
    const bot = findTeamBot(queryClient.getQueryData(projectsQuery.queryKey), botId)
    const response = settleChatRun(botId, settledStatuses[event.reason])

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: client.query.conversations.history.key({ input: { botId } }) }),
      queryClient.invalidateQueries({ queryKey: client.query.tasks.key() }),
      invalidateTeam(),
      alertTurnFinished({ bot, reason: event.reason, response, ...(event.error ? { error: event.error } : {}) }).catch((alertError: unknown) => {
        console.error("O aviso do turno falhou", alertError)
      }),
    ])
  }

  async function invalidateTeam() {
    await queryClient.invalidateQueries({ queryKey: client.query.projects.key() })
  }

  async function consume(events: AsyncIterable<BotConversationEvent>) {
    try {
      for await (const entry of events) {
        await handle(entry)
      }
    } finally {
      chunks.drainAll()
    }
  }

  async function listen() {
    while (!controller.signal.aborted) {
      const events = await client.raw.conversations.events(undefined, { signal: controller.signal }).catch(() => {})

      if (events) {
        resetChatQueues()
        await consume(events).catch(() => {})
      }

      await new Promise<void>((resolve) => setTimeout(resolve, reconnectDelayMs))
    }
  }

  void listen()

  return () => controller.abort()
}
