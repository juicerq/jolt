import { Store } from "@tanstack/react-store"

type BotsState = {
  selectedBotId: string | null
  draft: boolean
  dialog: "create-project" | null
}

export const botsStore = new Store<BotsState>({
  selectedBotId: null,
  draft: false,
  dialog: null,
})

export function selectBot(botId: string) {
  botsStore.setState((state) => ({ ...state, selectedBotId: botId, draft: false, dialog: null }))
}

export function openCreateBot() {
  botsStore.setState((state) => ({ ...state, draft: true }))
}

export function discardDraft() {
  botsStore.setState((state) => ({ ...state, draft: false }))
}

export function openCreateProject() {
  botsStore.setState((state) => ({ ...state, dialog: "create-project" }))
}

export function closeDialog() {
  botsStore.setState((state) => ({ ...state, dialog: null }))
}
