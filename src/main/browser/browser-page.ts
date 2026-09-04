import { BaseWindow, WebContentsView, type BrowserWindow } from "electron"
import type { BrowserAction, BrowserBounds, BrowserPreview } from "@src/shared/browser"
import { BrowserDriver } from "./browser-driver"

export class BrowserPage {
  private readonly driver: BrowserDriver
  private readonly background = new BaseWindow({ show: false, width: 1280, height: 800, skipTaskbar: true })
  private shown = false
  readonly view: WebContentsView
  readonly preview: BrowserPreview
  private waiters = new Set<() => void>()
  private closed = false
  private controlRevision = 0
  private readonly lifetime = new AbortController()
  private busy = false
  private readonly popups = new Set<BrowserWindow>()

  constructor(readonly window: BrowserWindow, bot: { botId: string; botName: string }, private readonly changed: () => void) {
    this.preview = { botId: bot.botId, botName: bot.botName, url: "about:blank", title: "Navegador", control: "bot", reason: null, image: null, error: null }
    this.view = new WebContentsView({ webPreferences: { partition: "persist:jolt-browser", sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } })
    this.driver = new BrowserDriver(this.view.webContents)
    this.view.setBounds({ x: 0, y: 0, width: 1280, height: 800 })
    this.background.contentView.addChildView(this.view)
    this.view.setVisible(true)
    const contents = this.view.webContents

    contents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
    contents.session.setPermissionCheckHandler(() => false)
    contents.setWindowOpenHandler(({ url }) => {
      const allowed = /^https?:\/\//.test(url)

      if (allowed && this.preview.control === "user") {
        return { action: "allow", overrideBrowserWindowOptions: { parent: window, modal: true, width: 640, height: 720, autoHideMenuBar: true, webPreferences: { partition: "persist:jolt-browser", sandbox: true, contextIsolation: true, nodeIntegration: false } } }
      }

      if (allowed) {
        void contents.loadURL(url).catch((error: Error) => this.fail(error.message))
      }

      return { action: "deny" }
    })
    contents.on("did-create-window", (popup) => {
      this.popups.add(popup)
      popup.webContents.setWindowOpenHandler(() => ({ action: "deny" }))
      popup.on("closed", () => this.popups.delete(popup))
    })
    contents.on("will-navigate", (event, url) => {
      const allowed = /^https?:\/\//.test(url)

      if (!allowed) {
        event.preventDefault()
      }
    })
    contents.on("will-redirect", (event, url) => {
      const allowed = /^https?:\/\//.test(url)

      if (!allowed) {
        event.preventDefault()
      }
    })
    contents.on("did-navigate", () => this.update())
    contents.on("did-navigate-in-page", () => this.update())
    contents.on("page-title-updated", () => this.update())
    contents.on("did-fail-load", (_event, code, description, _url, mainFrame) => {
      if (mainFrame && code !== -3) {
        this.fail(description)
      }
    })
    contents.on("render-process-gone", () => {
      this.fail("A página parou de responder. Feche o navegador e tente novamente.")
      this.close()
    })
    void contents.loadURL("about:blank")
  }

  private update() {
    this.preview.url = this.view.webContents.getURL()
    this.preview.title = this.view.webContents.getTitle() || "Navegador"
    this.changed()
  }

  private fail(message: string) {
    this.preview.error = message
    this.changed()
  }

  async takeControl(reason?: string) {
    this.controlRevision += 1
    this.preview.control = "user"

    if (reason) {
      this.preview.reason = reason
    }

    this.changed()
    await this.driver.settle()
  }

  show(bounds: BrowserBounds) {
    if (!this.shown) {
      this.background.contentView.removeChildView(this.view)
      this.window.contentView.addChildView(this.view)
      this.shown = true
    }

    this.view.setBounds(bounds)
    this.view.webContents.focus()
  }

  minimize() {
    if (!this.shown) {
      return
    }

    this.window.contentView.removeChildView(this.view)
    this.background.contentView.addChildView(this.view)
    this.shown = false
  }

  resume() {
    if (this.popups.size) {
      throw new Error("Close the site login window before returning browser control")
    }

    this.controlRevision += 1
    this.preview.control = "bot"
    this.preview.reason = null
    this.minimize()
    this.view.setBounds({ x: 0, y: 0, width: 1280, height: 800 })

    for (const resolve of this.waiters) {
      resolve()
    }

    this.changed()
  }

  private async waitForControl(signal: AbortSignal) {
    signal.throwIfAborted()

    if (this.preview.control === "user" && !this.closed) {
      await new Promise<void>((resolve, reject) => {
        const finish = () => {
          this.waiters.delete(finish)
          signal.removeEventListener("abort", abort)
          resolve()
        }
        const abort = () => {
          this.waiters.delete(finish)
          reject(new Error("Browser action interrupted"))
        }

        this.waiters.add(finish)
        signal.addEventListener("abort", abort, { once: true })
      })
    }

    signal.throwIfAborted()

    if (this.closed) {
      throw new Error("The person closed the browser")
    }
  }

  async execute(input: BrowserAction, callerSignal: AbortSignal) {
    const signal = AbortSignal.any([callerSignal, this.lifetime.signal])
    const revision = this.controlRevision

    if (this.busy) {
      throw new Error("A browser action is already running for this Bot")
    }

    this.busy = true

    try {
      await this.waitForControl(signal)
      this.preview.error = null

      if (input.action === "handoff") {
        await this.takeControl(input.reason)
        await this.waitForControl(signal)
        return "The person returned browser control. Take a fresh snapshot before continuing."
      }

      const ready = async () => {
        await this.waitForControl(signal)

        if (revision !== this.controlRevision && input.action !== "snapshot") {
          throw new Error("The person used the browser. Do not repeat the previous action; take a fresh snapshot before continuing.")
        }
      }
      await ready()

      if (input.action === "close") {
        return "Browser page closed. Site sessions are saved."
      }

      const result = await this.driver.execute(input, signal, ready)
      await this.waitForControl(signal)

      return result
    } catch (error) {
      if (!signal.aborted) {
        this.fail("Não foi possível concluir a ação. Você pode assumir o navegador.")
      }

      throw error
    } finally {
      this.busy = false
      this.changed()
    }
  }

  async capture() {
    if (this.closed) {
      return
    }

    const { width, height } = this.view.getBounds()
    const image = await this.view.webContents.capturePage({ x: 0, y: 0, width, height }, { stayHidden: true })
    const empty = image.isEmpty()

    if (!this.closed && !empty) {
      this.preview.image = image.resize({ width: 320 }).toDataURL()
    }
  }

  close() {
    if (this.closed) {
      return
    }

    this.closed = true

    for (const popup of this.popups) {
      popup.destroy()
    }

    this.lifetime.abort()
    void this.driver.close()

    for (const resolve of this.waiters) {
      resolve()
    }

    const windowDestroyed = this.window.isDestroyed()

    if (!windowDestroyed && this.shown) {
      this.window.contentView.removeChildView(this.view)
    }

    this.background.destroy()
    const destroyed = this.view.webContents.isDestroyed()

    if (!destroyed) {
      this.view.webContents.close()
    }
  }
}
