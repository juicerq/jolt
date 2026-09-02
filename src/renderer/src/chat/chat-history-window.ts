import type { HistoryPage } from "../../../shared/conversations"


export const recentMessageLimit = 60
export const earlierMessageBatch = 200

export function historyPageInput(botId: string, before?: string) {
  return before ? { botId, before, limit: earlierMessageBatch } : { botId, limit: recentMessageLimit }
}

export function olderHistoryPage(page: HistoryPage) {
  if (page.earlier === 0) {
    return undefined
  }

  return page.messages[0]?.id
}

export function flattenHistory(pages: HistoryPage[]) {
  return { messages: pages.toReversed().flatMap((page) => page.messages), earlier: pages.at(-1)?.earlier ?? 0 }
}

export function windowHistory<T>(messages: T[], shown: number) {
  const hidden = Math.max(0, messages.length - shown)

  return { visible: messages.slice(hidden), hidden }
}
