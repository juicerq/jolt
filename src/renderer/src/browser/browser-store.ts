import { Store } from "@tanstack/react-store"
import type { BrowserState } from "@src/shared/browser"

export const browserStore = new Store<BrowserState>({ pages: [], focusedBotId: null })
