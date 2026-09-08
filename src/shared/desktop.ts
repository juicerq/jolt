import type { BrowserBounds, BrowserState } from "./browser"
import type { EngineConnection } from "./engine-ipc"
import type { MobileAccess, MobileAccessUpdate } from "./mobile-access"
import type { TurnNotification } from "./turn-notification"

export interface Desktop {
  remote: boolean
  getBrowserState: () => Promise<BrowserState>
  watchBrowser: (botId: string) => Promise<void>
  takeBrowserControl: (botId: string) => Promise<void>
  setBrowserBounds: (bounds: BrowserBounds) => Promise<void>
  resumeBrowser: (botId: string) => Promise<void>
  minimizeBrowser: () => Promise<void>
  closeBrowser: (botId: string) => Promise<void>
  closeBrowserPopup: (botId: string) => Promise<void>
  onBrowserState: (listener: (state: BrowserState) => void) => void
  getEngineConnection: () => Promise<EngineConnection | null>
  renewEngineConnection: () => Promise<EngineConnection | null>
  getMobileAccess: () => Promise<MobileAccess>
  configureMobileAccess: (update: MobileAccessUpdate) => Promise<MobileAccess>
  unpairMobileAccess: () => Promise<MobileAccess>
  chooseWorkingDirectory: () => Promise<string | null>
  minimizeWindow: () => Promise<void>
  toggleMaximizeWindow: () => Promise<void>
  closeWindow: () => Promise<void>
  openInBrowser: (url: string) => Promise<void>
  notifyTurnFinished: (notification: TurnNotification) => Promise<void>
  onTurnNotificationOpened: (listener: (botId: string) => void) => void
  installUpdate: () => Promise<void>
  onUpdateReady: (listener: () => void) => void
}
