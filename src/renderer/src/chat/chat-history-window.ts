export const recentMessageLimit = 60
export const earlierMessageBatch = 200

export function windowHistory<T>(messages: T[], shown: number) {
  const hidden = Math.max(0, messages.length - shown)

  return { visible: messages.slice(hidden), hidden }
}
