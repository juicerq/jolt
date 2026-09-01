import type { QueryClient } from "@tanstack/react-query"
import type { BotConversationEvent, FinishReason } from "../../../shared/conversations"
import type { EngineClient } from "../engine-client"
import {
  appendChatText,
  appendChatThinking,
  finishChatThinking,
  finishChatTool,
  settleChatRun,
  startChatRun,
  startChatThinking,
  startChatTool,
} from "./chat-store"

const reconnectDelayMs = 1_000
const settledStatuses: Record<FinishReason, "available" | "completed" | "error"> = { stop: "completed", aborted: "available", error: "error" }

export function subscribeChatEvents({ client, queryClient }: { client: Pick<EngineClient, "query" | "raw">; queryClient: QueryClient }) {
  const controller = new AbortController()

  async function handle({ botId, event }: BotConversationEvent) {
    if (event.type === "started") {
      startChatRun(botId, event.message)
      await invalidateTeam()
      return
    }

    if (event.type === "text") {
      appendChatText(botId, event.text)
      return
    }

    if (event.type === "thinking") {
      appendChatThinking(botId, event.text)
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
      startChatTool(botId, event.callId, event.tool, event.detail)
      return
    }

    if (event.type === "tool-finished") {
      finishChatTool(botId, event.callId, event.failed)
      return
    }

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: client.query.conversations.key() }),
      queryClient.invalidateQueries({ queryKey: client.query.tasks.key() }),
      invalidateTeam(),
    ])
    settleChatRun(botId, settledStatuses[event.reason])
  }

  async function invalidateTeam() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: client.query.bots.key() }),
      queryClient.invalidateQueries({ queryKey: client.query.projects.key() }),
    ])
  }

  async function consume(events: AsyncIterable<BotConversationEvent>) {
    for await (const entry of events) {
      await handle(entry)
    }
  }

  async function listen() {
    while (!controller.signal.aborted) {
      const events = await client.raw.conversations.events(undefined, { signal: controller.signal }).catch(() => undefined)

      if (events) {
        await consume(events).catch(() => undefined)
      }

      await new Promise<void>((resolve) => setTimeout(resolve, reconnectDelayMs))
    }
  }

  void listen()

  return () => controller.abort()
}
