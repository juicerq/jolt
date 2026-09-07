import { Store } from "@tanstack/react-store"
import type { BrowserPreview, BrowserState } from "@src/shared/browser"

export const browserStore = new Store<BrowserState>({ pages: [], focusedBotId: null })

export function setBrowserPages(pages: BrowserPreview[]) {
  browserStore.setState((state) => ({ pages, focusedBotId: pages.some((page) => page.botId === state.focusedBotId) ? state.focusedBotId : null }))
}

export function focusBrowser(botId: string | null) {
  browserStore.setState((state) => ({ ...state, focusedBotId: botId }))
}
