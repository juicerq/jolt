import { botsStore } from "../bots/bots-store"

function visibleConversation() {
  const { selectedBotId, botRoute, mobileList, screen, draft } = botsStore.state
  const hidden = document.visibilityState !== "visible" || mobileList || screen || draft || botRoute.name !== "chat"

  if (hidden) {
    return null
  }

  return selectedBotId
}

export const chatVisits = {
  last(botId: string) {
    return localStorage.getItem(`mimo.visited.${botId}`)
  },
  subscribe() {
    let current = visibleConversation()

    function save() {
      if (current) {
        localStorage.setItem(`mimo.visited.${current}`, new Date().toISOString())
      }
    }

    function update() {
      const next = visibleConversation()

      if (next !== current) {
        save()
        current = next
      }
    }

    botsStore.subscribe(update)
    document.addEventListener("visibilitychange", update)
    window.addEventListener("pagehide", save)
  },
}
