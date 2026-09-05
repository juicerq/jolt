import type { BrowserState, BrowserBounds } from "@src/shared/browser"
import type { EngineConnection } from "@src/shared/engine-ipc"
import type { TurnNotification } from "@src/shared/turn-notification"

declare global {
  interface Window {
    desktop: {
      getBrowserState(): Promise<BrowserState>
      watchBrowser(botId: string): Promise<void>
      takeBrowserControl(botId: string): Promise<void>
      setBrowserBounds(bounds: BrowserBounds): Promise<void>
      resumeBrowser(botId: string): Promise<void>
      minimizeBrowser(): Promise<void>
      closeBrowser(botId: string): Promise<void>
      closeBrowserPopup(botId: string): Promise<void>
      onBrowserState(listener: (state: BrowserState) => void): void
      getEngineConnection(): Promise<EngineConnection>
      chooseWorkingDirectory(): Promise<string | null>
      minimizeWindow(): Promise<void>
      toggleMaximizeWindow(): Promise<void>
      closeWindow(): Promise<void>
      openInBrowser(url: string): Promise<void>
      notifyTurnFinished(notification: TurnNotification): Promise<void>
      onTurnNotificationOpened(listener: (botId: string) => void): void
      installUpdate(): Promise<void>
      onUpdateReady(listener: () => void): void
    }
  }
}

export {}
