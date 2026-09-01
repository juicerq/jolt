import type { QueryClient } from "@tanstack/react-query"
import type { BotConversationEvent } from "../../../shared/conversations"
import type { EngineClient } from "../engine-client"
import {
  appendChatText,
  appendChatThinking,
  failChatRun,
  finishChatThinking,
  finishChatTool,
  settleChatRun,
  startChatRun,
  startChatThinking,
  startChatTool,
} from "./chat-store"

const reconnectDelayMs = 1_000

export function subscribeChatEvents({ client, queryClient }: { client: Pick<EngineClient, "query" | "raw">; queryClient: QueryClient }) {
  const controller = new AbortController()

  async function handle({ botId, event }: BotConversationEvent) {
    if (event.type === "started") {
      startChatRun(botId, event.message)
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

    if (event.reason === "error") {
      failChatRun(botId, "O bot não conseguiu concluir a resposta")
      return
    }

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: client.query.conversations.key() }),
      queryClient.invalidateQueries({ queryKey: client.query.tasks.key() }),
    ])
    settleChatRun(botId, event.reason === "stop" ? "completed" : "available")
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
