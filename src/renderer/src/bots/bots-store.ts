import { Store } from "@tanstack/react-store"

type BotsState = {
  selectedBotId: string | null
  isCreateOpen: boolean
}

export const botsStore = new Store<BotsState>({
  selectedBotId: null,
  isCreateOpen: false,
})

export function selectBot(botId: string) {
  botsStore.setState((state) => ({ ...state, selectedBotId: botId, isCreateOpen: false }))
}

export function openCreateBot() {
  botsStore.setState((state) => ({ ...state, isCreateOpen: true }))
}

export function closeCreateBot() {
  botsStore.setState((state) => ({ ...state, isCreateOpen: false }))
}
