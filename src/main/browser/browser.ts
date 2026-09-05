import { ipcMain, View, WebContentsView, type BrowserWindow } from "electron"
import { z } from "zod"
import { browserBounds, type BrowserRequest, type BrowserState } from "@src/shared/browser"
import { parse } from "@src/shared/parse"
import { BrowserPage } from "./browser-page"

export class Browser {
  private readonly pages = new Map<string, BrowserPage>()
  private focusedBotId: string | null = null
  private readonly timer: ReturnType<typeof setInterval>
  private capturing = false
  private readonly stackingAnchor = new View()
  private readonly inputShield = new WebContentsView({ webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } })

  constructor(private readonly window: BrowserWindow) {
    this.inputShield.setBackgroundColor("#00000000")
    void this.inputShield.webContents.loadURL("data:text/html,<html><body style='margin:0;background:transparent;overflow:hidden'></body></html>")
    this.inputShield.webContents.on("before-input-event", (event, input) => {
      event.preventDefault()

      if (input.type === "keyDown" && input.key === "Escape") {
        this.minimize()
      }

      if (input.key === "Tab") {
        window.webContents.focus()
      }
    })
    window.webContents.on("before-input-event", (event, input) => {
      if (input.type === "keyDown" && input.key === "Escape" && this.focusedBotId) {
        event.preventDefault()
        this.minimize()
      }
    })
    const handle = (name: string, action: (raw: unknown) => unknown) => {
      ipcMain.handle(`agent-browser:${name}`, (event, raw: unknown) => {
        if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) {
          throw new Error("Untrusted browser caller")
        }

        return action(raw)
      })
    }

    handle("state", () => this.state())
    handle("watch", (raw) => this.focus(parse(z.string(), raw)))
    handle("take-control", async (raw) => {
      const botId = parse(z.string(), raw)
      const page = this.page(botId)

      await page.takeControl()

      if (this.pages.get(botId) !== page) {
        return
      }

      this.focus(botId)
    })
    handle("bounds", (raw) => {
      const bounds = parse(browserBounds, raw)
      const page = this.focusedBotId ? this.pages.get(this.focusedBotId) : undefined

      if (page) {
        const [width, height] = window.getContentSize()

        if (bounds.x + bounds.width > width || bounds.y + bounds.height > height) {
          return
        }

        page.show(bounds)
        this.inputShield.setBounds(bounds)

        if (page.preview.control === "bot") {
          window.contentView.addChildView(this.inputShield)
        } else {
          window.contentView.removeChildView(this.inputShield)
        }

        window.contentView.addChildView(this.stackingAnchor)
      }
    })
    handle("resume", (raw) => {
      const botId = parse(z.string(), raw)

      this.page(botId).resume()

      if (this.focusedBotId === botId) {
        window.contentView.addChildView(this.inputShield)
      }

      window.webContents.focus()
      this.publish()
    })
    handle("minimize", () => this.minimize())
    handle("close-popup", (raw) => this.page(parse(z.string(), raw)).closePopup())
    handle("close", (raw) => this.close(parse(z.string(), raw)))
    this.timer = setInterval(() => void this.capture(), 1000)
    window.on("closed", () => {
      clearInterval(this.timer)

      for (const page of this.pages.values()) {
        page.close()
      }

      this.pages.clear()
      this.inputShield.webContents.close()
    })
  }

  private page(botId: string) {
    const page = this.pages.get(botId)

    if (!page) {
      throw new Error("Browser page is closed")
    }

    return page
  }

  private state(): BrowserState {
    return { pages: [...this.pages.values()].map((page) => ({ ...page.preview })), focusedBotId: this.focusedBotId }
  }

  private focus(botId: string) {
    this.page(botId)

    for (const page of this.pages.values()) {
      if (page.preview.botId !== botId) {
        page.minimize()
      }
    }

    this.focusedBotId = botId
    this.publish()
  }

  private publish() {
    const destroyed = this.window.isDestroyed()

    if (!destroyed) {
      this.window.webContents.send("agent-browser:state", this.state())
    }
  }

  private async capture() {
    if (this.capturing) {
      return
    }

    this.capturing = true

    try {
      for (const page of this.pages.values()) {
        await page.capture().catch(() => {})
      }

      if (this.pages.size) {
        this.publish()
      }
    } finally {
      this.capturing = false
    }
  }

  async execute(request: BrowserRequest, signal: AbortSignal) {
    signal.throwIfAborted()

    if (request.input.action === "close") {
      const page = this.pages.get(request.botId)

      if (!page) {
        return "Browser page is already closed."
      }

      const result = await page.execute(request.input, signal)
      this.close(request.botId)

      return result
    }

    let page = this.pages.get(request.botId)

    if (!page) {
      page = new BrowserPage(this.window, request, () => this.publish())
      page.view.webContents.on("before-input-event", (event, input) => {
        if (input.type === "keyDown" && input.key === "Escape" && page?.preview.control === "user" && this.focusedBotId === request.botId) {
          event.preventDefault()
          this.minimize()
        }
      })
      this.pages.set(request.botId, page)
      this.publish()
    }

    return page.execute(request.input, signal)
  }

  private minimize() {
    this.window.contentView.removeChildView(this.inputShield)

    if (this.focusedBotId) {
      this.page(this.focusedBotId).minimize()
    }

    this.focusedBotId = null
    this.window.webContents.focus()
    this.publish()
  }

  private close(botId: string) {
    this.pages.get(botId)?.close()
    this.pages.delete(botId)

    if (this.focusedBotId === botId) {
      this.window.contentView.removeChildView(this.inputShield)
      this.focusedBotId = null
    }

    this.publish()
  }
}
