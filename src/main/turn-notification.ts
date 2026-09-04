import { type BrowserWindow, Notification } from "electron"
import type { TurnNotification } from "../shared/turn-notification"

type NotificationWindow = Pick<BrowserWindow, "flashFrame" | "focus" | "isDestroyed" | "isMinimized" | "restore"> & {
  on(event: "focus", listener: () => void): unknown
}

export function createTurnNotifications({ window, icon, openConversation }: { window: NotificationWindow; icon: string; openConversation: (botId: string) => void }) {
  window.on("focus", () => window.flashFrame(false))

  return {
    show({ botId, title, body }: TurnNotification) {
      const destroyed = window.isDestroyed()
      const supported = Notification.isSupported()

      if (destroyed || !supported) {
        return
      }

      const notification = new Notification({ title, body, icon, silent: true })

      notification.on("click", () => {
        if (window.isDestroyed()) {
          return
        }

        const minimized = window.isMinimized()

        if (minimized) {
          window.restore()
        }

        window.focus()
        window.flashFrame(false)
        openConversation(botId)
      })
      notification.show()
      window.flashFrame(true)
    },
  }
}
