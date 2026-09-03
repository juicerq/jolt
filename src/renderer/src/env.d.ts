import type { EngineConnection } from "../../shared/engine-ipc"
import type { TurnNotification } from "../../shared/turn-notification"

declare global {
  interface Window {
    desktop: {
      getEngineConnection(): Promise<EngineConnection>
      chooseWorkingDirectory(): Promise<string | null>
      minimizeWindow(): Promise<void>
      toggleMaximizeWindow(): Promise<void>
      closeWindow(): Promise<void>
      openInBrowser(url: string): Promise<void>
      notifyTurnFinished(notification: TurnNotification): Promise<void>
    }
  }
}

export {}
