import { Store } from "@tanstack/react-store"
import { beginConversationOpen } from "../chat/chat-open-span"

type BotsState = {
  selectedBotId: string | null
  draft: { name: string } | null
  dialog: "create-project" | null
}

export const botsStore = new Store<BotsState>({
  selectedBotId: null,
  draft: null,
  dialog: null,
})

export function selectBot(botId: string) {
  if (botsStore.state.selectedBotId !== botId) {
    beginConversationOpen(botId)
  }

  botsStore.setState((state) => ({ ...state, selectedBotId: botId, draft: null, dialog: null }))
}

export function forgetBot(botId: string) {
  botsStore.setState((state) => (state.selectedBotId === botId ? { ...state, selectedBotId: null } : state))
}

export function openCreateBot() {
  botsStore.setState((state) => ({ ...state, draft: state.draft ?? { name: "" } }))
}

export function nameDraft(name: string) {
  botsStore.setState((state) => ({ ...state, draft: { name } }))
}

export function discardDraft() {
  botsStore.setState((state) => ({ ...state, draft: null }))
}

export function openCreateProject() {
  botsStore.setState((state) => ({ ...state, dialog: "create-project" }))
}

export function closeDialog() {
  botsStore.setState((state) => ({ ...state, dialog: null }))
}
