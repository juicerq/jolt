import { Store } from "@tanstack/react-store"

type BotsState = {
  selectedBotId: string | null
  dialog: "create-bot" | "create-project" | null
}

export const botsStore = new Store<BotsState>({
  selectedBotId: null,
  dialog: null,
})

export function selectBot(botId: string) {
  botsStore.setState((state) => ({ ...state, selectedBotId: botId, dialog: null }))
}

export function openCreateBot() {
  botsStore.setState((state) => ({ ...state, dialog: "create-bot" }))
}

export function openCreateProject() {
  botsStore.setState((state) => ({ ...state, dialog: "create-project" }))
}

export function closeDialog() {
  botsStore.setState((state) => ({ ...state, dialog: null }))
}
