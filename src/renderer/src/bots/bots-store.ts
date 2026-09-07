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
  browserSidebarOpen: boolean
  mobileMenuOpen: boolean
}

export const botsStore = new Store<BotsState>({
  selectedBotId: null,
  botRoute: { name: "chat" },
  draft: null,
  dialog: null,
  screen: null,
  browserSidebarOpen: false,
  mobileMenuOpen: false,
})

function navigate(update: (state: BotsState) => BotsState) {
  botsStore.setState((state) => ({ ...update(state), browserSidebarOpen: false, mobileMenuOpen: false }))
}

export function selectBot(botId: string) {
  if (botsStore.state.selectedBotId !== botId) {
    beginConversationOpen(botId)
  }

  navigate((state) => ({ ...state, selectedBotId: botId, botRoute: { name: "chat" }, draft: null, dialog: null, screen: null }))
}

export function openBotRoute(route: BotRoute) {
  navigate((state) => ({ ...state, botRoute: route }))
}

export function openPlugins() {
  navigate((state) => ({ ...state, screen: "plugins", draft: null, dialog: null }))
}

export function openSettings() {
  navigate((state) => ({ ...state, screen: "settings", dialog: null }))
}

export function closeWorkspaceScreen() {
  navigate((state) => ({ ...state, screen: null }))
}

export function closeMobileMenu() {
  botsStore.setState((state) => ({ ...state, mobileMenuOpen: false }))
}

export function openMobileMenu() {
  botsStore.setState((state) => ({ ...state, mobileMenuOpen: true, browserSidebarOpen: false }))
}

export function forgetBot(botId: string) {
  botsStore.setState((state) => (state.selectedBotId === botId ? { ...state, selectedBotId: null, browserSidebarOpen: false } : state))
}

export function openCreateBot() {
  navigate((state) => ({ ...state, draft: state.draft ?? { avatarSeed: null, name: "" }, screen: null }))
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
  navigate((state) => ({ ...state, draft: null }))
}

export function toggleBrowserSidebar() {
  botsStore.setState((state) => ({ ...state, browserSidebarOpen: !state.browserSidebarOpen, mobileMenuOpen: false }))
}

export function closeBrowserSidebar() {
  botsStore.setState((state) => ({ ...state, browserSidebarOpen: false }))
}

export function openCreateProject() {
  navigate((state) => ({ ...state, dialog: "create-project" }))
}

export function closeDialog() {
  botsStore.setState((state) => ({ ...state, dialog: null }))
}
