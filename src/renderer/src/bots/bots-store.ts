import { Store } from "@tanstack/react-store"
import { beginConversationOpen } from "../chat/chat-open-span"

export type BotRoute =
  | { name: "chat" }
  | { name: "settings" }
  | { name: "routines" }
  | { name: "memory" }
  | { name: "routine"; id: "new" | string }

type BotsState = {
  selectedBotId: string | null
  botRoute: BotRoute
  draft: { name: string } | null
  dialog: "create-project" | null
  screen: "plugins" | null
}

export const botsStore = new Store<BotsState>({
  selectedBotId: null,
  botRoute: { name: "chat" },
  draft: null,
  dialog: null,
  screen: null,
})

export function selectBot(botId: string) {
  if (botsStore.state.selectedBotId !== botId) {
    beginConversationOpen(botId)
  }

  botsStore.setState((state) => ({ ...state, selectedBotId: botId, botRoute: { name: "chat" }, draft: null, dialog: null, screen: null }))
}

export function openBotRoute(route: BotRoute) {
  botsStore.setState((state) => ({ ...state, botRoute: route }))
}

export function openPlugins() {
  botsStore.setState((state) => ({ ...state, screen: "plugins", draft: null, dialog: null }))
}

export function closePlugins() {
  botsStore.setState((state) => ({ ...state, screen: null }))
}

export function forgetBot(botId: string) {
  botsStore.setState((state) => (state.selectedBotId === botId ? { ...state, selectedBotId: null } : state))
}

export function openCreateBot() {
  botsStore.setState((state) => ({ ...state, draft: state.draft ?? { name: "" }, screen: null }))
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
