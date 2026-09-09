import type { Bot } from "@src/shared/bots"
import { Store } from "@tanstack/react-store"
import { defaultBotAvatarSeed, randomBotAvatarSeed } from "@src/shared/bot-avatar"
import { beginConversationOpen } from "../chat/chat-open-span"

export type BotRoute =
  | { name: "chat" }
  | { name: "details" }
  | { name: "settings" }
  | { name: "routines" }
  | { name: "triggers" }
  | { name: "memory" }
  | { name: "members"; create?: boolean }
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
  mobileList: boolean
}

export const botsStore = new Store<BotsState>({
  selectedBotId: null,
  botRoute: { name: "chat" },
  draft: null,
  dialog: null,
  screen: null,
  browserSidebarOpen: false,
  mobileMenuOpen: false,
  mobileList: true,
})

export function selectBot(botId: string) {
  if (botsStore.state.selectedBotId !== botId) {
    beginConversationOpen(botId)
  }

  navigate((state) => ({ ...state, selectedBotId: botId, mobileList: false, botRoute: { name: "chat" }, draft: null, dialog: null, screen: null }))
}

export function openCreateTeamBot(bot: Pick<Bot, "id" | "leaderBotId">) {
  navigate((state) => ({ ...state, selectedBotId: bot.leaderBotId ?? bot.id, mobileList: false, botRoute: { name: "members", create: true }, draft: null, dialog: null, screen: null }))
}

export function openBotRoute(route: BotRoute) {
  navigate((state) => ({ ...state, botRoute: route }))
}

export function openPlugins() {
  navigate((state) => ({ ...state, screen: "plugins", mobileList: false, draft: null, dialog: null }))
}

export function openSettings() {
  navigate((state) => ({ ...state, screen: "settings", mobileList: false, dialog: null }))
}

export function closeWorkspaceScreen() {
  navigate((state) => ({ ...state, screen: null, mobileList: !state.selectedBotId }))
}

export function showBotList() {
  navigate((state) => ({ ...state, mobileList: true, screen: null, draft: null, botRoute: { name: "chat" } }))
}

export function forgetBot(botId: string) {
  navigate((state) => (state.selectedBotId === botId ? { ...state, selectedBotId: null, mobileList: true } : state))
}

export function openCreateBot() {
  navigate((state) => ({ ...state, draft: state.draft ?? { avatarSeed: null, name: "" }, mobileList: false, screen: null }))
}

export function nameDraft(name: string) {
  navigate((state) => ({ ...state, draft: state.draft ? { ...state.draft, name } : null }))
}

export function regenerateDraftAvatar() {
  const avatarSeed = randomBotAvatarSeed()
  navigate((state) => ({ ...state, draft: state.draft ? { ...state.draft, avatarSeed } : null }))
}

export function botDraftAvatarSeed(draft: BotDraft) {
  return draft.avatarSeed ?? defaultBotAvatarSeed(draft.name)
}

export function discardDraft() {
  navigate((state) => ({ ...state, draft: null, mobileList: !state.selectedBotId }))
}

export function openCreateProject() {
  navigate((state) => ({ ...state, dialog: "create-project" }))
}

export function closeDialog() {
  navigate((state) => ({ ...state, dialog: null }))
}

function navigate(update: (state: BotsState) => BotsState) {
  botsStore.setState((state) => ({ ...update(state), browserSidebarOpen: false, mobileMenuOpen: false }))
}

export function closeMobileMenu() {
  botsStore.setState((state) => ({ ...state, mobileMenuOpen: false }))
}

export function openMobileMenu() {
  botsStore.setState((state) => ({ ...state, mobileMenuOpen: true, browserSidebarOpen: false }))
}

export function toggleBrowserSidebar() {
  botsStore.setState((state) => ({ ...state, browserSidebarOpen: !state.browserSidebarOpen, mobileMenuOpen: false }))
}

export function closeBrowserSidebar() {
  botsStore.setState((state) => ({ ...state, browserSidebarOpen: false }))
}
