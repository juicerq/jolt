import { ipcMain, View, type BrowserWindow } from "electron"
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

  constructor(private readonly window: BrowserWindow) {
    const handle = (name: string, action: (raw: unknown) => unknown) => {
      ipcMain.handle(`agent-browser:${name}`, (event, raw: unknown) => {
        if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) {
          throw new Error("Untrusted browser caller")
        }

        return action(raw)
      })
    }

    handle("state", () => this.state())
    handle("take-control", async (raw) => {
      const botId = parse(z.string(), raw)
      const page = this.page(botId)

      for (const other of this.pages.values()) {
        if (other !== page) {
          other.minimize()
        }
      }

      await page.takeControl()

      if (this.pages.get(botId) !== page) {
        return
      }

      this.focusedBotId = botId
      this.publish()
    })
    handle("bounds", (raw) => {
      const bounds = parse(browserBounds, raw)
      const page = this.focusedBotId ? this.pages.get(this.focusedBotId) : undefined

      if (page?.preview.control === "user") {
        const [width, height] = window.getContentSize()

        if (bounds.x + bounds.width > width || bounds.y + bounds.height > height) {
          return
        }

        page.show(bounds)
        window.contentView.addChildView(this.stackingAnchor)
      }
    })
    handle("resume", (raw) => {
      const botId = parse(z.string(), raw)

      this.page(botId).resume()

      if (this.focusedBotId === botId) {
        this.focusedBotId = null
      }

      window.webContents.focus()
      this.publish()
    })
    handle("minimize", () => this.minimize())
    handle("close", (raw) => this.close(parse(z.string(), raw)))
    this.timer = setInterval(() => void this.capture(), 1000)
    window.on("closed", () => {
      clearInterval(this.timer)

      for (const page of this.pages.values()) {
        page.close()
      }

      this.pages.clear()
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
        if (input.type === "keyDown" && input.key === "Escape" && this.focusedBotId === request.botId) {
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
      this.focusedBotId = null
    }

    this.publish()
  }
}
