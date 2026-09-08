import { conversationPreview } from "./conversation-preview"
import { useQuery } from "@tanstack/react-query"
import { useSelector } from "@tanstack/react-store"
import type { ConversationOverview } from "@src/shared/conversations"
import type { EngineClient } from "../engine-client"
import { chatStore, type ChatStatus } from "./chat-store"

export function needsResponse(status: ChatStatus) {
  return status === "awaiting-response" || status === "awaiting-decision"
}

export function useConversationOverview(client: EngineClient) {
  const { data, error, isPending } = useQuery(client.query.conversations.overview.queryOptions({ select: previewOverview }))
  const statuses = useSelector(chatStore, (state) => state.statuses)
  const byBot = data ?? {}

  function status(botId: string): ChatStatus {
    if (statuses[botId]) {
      return statuses[botId]
    }

    return recordedStatus(byBot[botId])
  }

  return { byBot, status, error, isPending }
}

function previewOverview(entries: ConversationOverview[]) {
  return Object.fromEntries(entries.map((entry) => [entry.botId, { ...entry, preview: conversationPreview(entry.preview) }]))
}

function recordedStatus(entry?: ConversationOverview): ChatStatus {
  if (entry?.awaitingResponse) {
    return "awaiting-response"
  }

  if (entry?.ending === "failed") {
    return "error"
  }

  if (entry?.authorBotId === entry?.botId && entry?.author === "bot" && !entry.ending) {
    return "completed"
  }

  return "available"
}
