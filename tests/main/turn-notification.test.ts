import { EventEmitter } from "node:events"
import { expect, mock, test } from "bun:test"

class FakeNotification extends EventEmitter {
  static latest: FakeNotification | undefined

  static isSupported() {
    return true
  }

  constructor(readonly options: { title: string; body: string; icon: string; silent?: boolean }) {
    super()
    FakeNotification.latest = this
  }

  show() {}
}

mock.module("electron", () => ({ Notification: FakeNotification }))

const { createTurnNotifications } = await import("@src/main/turn-notification")

class WaylandWindow extends EventEmitter {
  activationRequests = 0
  activationToken = true
  attention = false
  destroyed = false
  focused = false
  minimized = false
  restores = 0

  flashFrame(flag: boolean) {
    this.attention = flag
  }

  focus() {
    this.activationRequests += 1

    if (this.activationToken) {
      this.activationToken = false
      this.focused = true
      this.emit("focus")
    }
  }

  isDestroyed() {
    return this.destroyed
  }

  isMinimized() {
    return this.minimized
  }

  restore() {
    this.restores += 1
    this.minimized = false
  }
}

test("clicar no aviso traz a janela existente para frente no Wayland", () => {
  const window = new WaylandWindow()
  const notifications = createTurnNotifications({ window, icon: "/icon.png", openConversation() {} })

  notifications.show({ botId: "bot-marina", title: "Marina", body: "Terminou o turno" })
  FakeNotification.latest?.emit("click")

  expect(window.minimized).toBe(false)
  expect(window.focused).toBe(true)
  expect(window.attention).toBe(false)
  expect(window.activationRequests).toBe(1)
  expect(window.restores).toBe(0)
})

test("clicar no aviso restaura uma janela minimizada antes de focá-la", () => {
  const window = new WaylandWindow()
  window.minimized = true
  const notifications = createTurnNotifications({ window, icon: "/icon.png", openConversation() {} })

  notifications.show({ botId: "bot-marina", title: "Marina", body: "Terminou o turno" })
  FakeNotification.latest?.emit("click")

  expect(window.minimized).toBe(false)
  expect(window.restores).toBe(1)
  expect(window.focused).toBe(true)
  expect(window.activationRequests).toBe(1)
})

test("clicar em um aviso antigo ignora uma janela que já foi destruída", () => {
  const window = new WaylandWindow()
  const notifications = createTurnNotifications({ window, icon: "/icon.png", openConversation() {} })

  notifications.show({ botId: "bot-marina", title: "Marina", body: "Terminou o turno" })
  window.destroyed = true
  FakeNotification.latest?.emit("click")

  expect(window.activationRequests).toBe(0)
})

test("o chime do Jolt substitui o som nativo do aviso", () => {
  const window = new WaylandWindow()
  const notifications = createTurnNotifications({ window, icon: "/icon.png", openConversation() {} })

  notifications.show({ botId: "bot-marina", title: "Marina", body: "Terminou o turno" })

  expect(FakeNotification.latest?.options).toEqual({ title: "Marina", body: "Terminou o turno", icon: "/icon.png", silent: true })
})
