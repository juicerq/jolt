import type { EngineConnection } from "@src/shared/engine-ipc"
import type { TurnNotification } from "@src/shared/turn-notification"

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
      onTurnNotificationOpened(listener: (botId: string) => void): void
      installUpdate(): Promise<void>
      onUpdateReady(listener: () => void): void
    }
  }
}

export {}
