import { Store } from "@tanstack/react-store"
import { defaultBotAvatarSeed, randomBotAvatarSeed } from "@src/shared/bot-avatar"
import { beginConversationOpen } from "../chat/chat-open-span"

export type BotRoute =
  | { name: "chat" }
  | { name: "settings" }
  | { name: "routines" }
  | { name: "triggers" }
  | { name: "memory" }
  | { name: "members" }
  | { name: "routine"; id: string }
  | { name: "trigger"; id: string }

export interface BotDraft {
  avatarSeed: string | null
  name: string
}

interface BotsState {
  selectedBotId: string | null
  botRoute: BotRoute
  draft: BotDraft | null
  dialog: "create-project" | null
  screen: "plugins" | "settings" | null
  /** Mobile only: the Bot list is the screen instead of the conversation plane. Desktop shows both. */
  listOpen: boolean
}

export const botsStore = new Store<BotsState>({
  selectedBotId: null,
  botRoute: { name: "chat" },
  draft: null,
  dialog: null,
  screen: null,
  listOpen: true,
})

export function selectBot(botId: string) {
  if (botsStore.state.selectedBotId !== botId) {
    beginConversationOpen(botId)
  }

  botsStore.setState((state) => ({ ...state, selectedBotId: botId, botRoute: { name: "chat" }, draft: null, dialog: null, screen: null, listOpen: false }))
}

export function openBotRoute(route: BotRoute) {
  botsStore.setState((state) => ({ ...state, botRoute: route }))
}

export function openBotList() {
  botsStore.setState((state) => ({ ...state, listOpen: true }))
}

export function openPlugins() {
  botsStore.setState((state) => ({ ...state, screen: "plugins", draft: null, dialog: null, listOpen: false }))
}

export function openSettings() {
  botsStore.setState((state) => ({ ...state, screen: "settings", draft: null, dialog: null, listOpen: false }))
}

export function closeWorkspaceScreen() {
  botsStore.setState((state) => ({ ...state, screen: null, listOpen: true }))
}

export function forgetBot(botId: string) {
  botsStore.setState((state) => (state.selectedBotId === botId ? { ...state, selectedBotId: null, listOpen: true } : state))
}

export function openCreateBot() {
  botsStore.setState((state) => ({ ...state, draft: state.draft ?? { avatarSeed: null, name: "" }, screen: null, listOpen: false }))
}

export function nameDraft(name: string) {
  botsStore.setState((state) => ({ ...state, draft: state.draft ? { ...state.draft, name } : null }))
}

export function regenerateDraftAvatar() {
  const avatarSeed = randomBotAvatarSeed()
  botsStore.setState((state) => ({ ...state, draft: state.draft ? { ...state.draft, avatarSeed } : null }))
}

export function botDraftAvatarSeed(draft: BotDraft) {
  return draft.avatarSeed ?? defaultBotAvatarSeed(draft.name)
}

export function discardDraft() {
  botsStore.setState((state) => ({ ...state, draft: null, listOpen: true }))
}

export function openCreateProject() {
  botsStore.setState((state) => ({ ...state, dialog: "create-project" }))
}

export function closeDialog() {
  botsStore.setState((state) => ({ ...state, dialog: null }))
}
