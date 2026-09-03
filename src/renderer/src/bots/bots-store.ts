import { Store } from "@tanstack/react-store"
import { defaultBotAvatarSeed, randomBotAvatarSeed } from "../../../shared/bot-avatar"
import { beginConversationOpen } from "../chat/chat-open-span"

export type BotDraft = {
  avatarSeed: string | null
  name: string
}

type BotsState = {
  selectedBotId: string | null
  draft: BotDraft | null
  dialog: "create-project" | null
  screen: "plugins" | null
}

export const botsStore = new Store<BotsState>({
  selectedBotId: null,
  draft: null,
  dialog: null,
  screen: null,
})

export function selectBot(botId: string) {
  if (botsStore.state.selectedBotId !== botId) {
    beginConversationOpen(botId)
  }

  botsStore.setState((state) => ({ ...state, selectedBotId: botId, draft: null, dialog: null, screen: null }))
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
  botsStore.setState((state) => ({ ...state, draft: state.draft ?? { avatarSeed: null, name: "" }, screen: null }))
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
  botsStore.setState((state) => ({ ...state, draft: null }))
}

export function openCreateProject() {
  botsStore.setState((state) => ({ ...state, dialog: "create-project" }))
}

export function closeDialog() {
  botsStore.setState((state) => ({ ...state, dialog: null }))
}
