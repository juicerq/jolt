export type ChatScrollMode = "follow" | "preserve"

const FOLLOW_DISTANCE = 312

export function getChatScrollMode(distanceFromEnd: number): ChatScrollMode {
  if (distanceFromEnd <= FOLLOW_DISTANCE) {
    return "follow"
  }

  return "preserve"
}
