import { BaseWindow, WebContentsView, type BrowserWindow, type BrowserWindowConstructorOptions, type WebContents } from "electron"
import type { BrowserAction, BrowserBounds, BrowserPreview } from "@src/shared/browser"
import { BrowserDriver } from "./browser-driver"

const webPreferences = { partition: "persist:jolt-browser", sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false }

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
  private requestingControl = false
  private popup?: WebContentsView

  constructor(readonly window: BrowserWindow, bot: { botId: string; botName: string }, private readonly changed: () => void) {
    this.preview = { botId: bot.botId, botName: bot.botName, url: "about:blank", title: "Navegador", control: "bot", popup: false, reason: null, image: null, error: null }
    this.view = new WebContentsView({ webPreferences })
    this.driver = new BrowserDriver(this.view.webContents)
    this.view.setBounds({ x: 0, y: 0, width: 1280, height: 800 })
    this.background.contentView.addChildView(this.view)
    this.view.setVisible(true)
    const contents = this.view.webContents

    contents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
    contents.session.setPermissionCheckHandler(() => false)
    contents.setWindowOpenHandler(({ url }) => {
      if (!/^https?:\/\//.test(url) || this.popup) {
        return { action: "deny" }
      }

      return { action: "allow", overrideBrowserWindowOptions: { webPreferences }, createWindow: (options) => this.openPopup(options) }
    })
    this.observe(contents)
    void contents.loadURL("about:blank")
  }

  private observe(contents: WebContents) {
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
    contents.on("focus", () => {
      if (this.shown && this.preview.control === "bot") {
        this.window.webContents.focus()
      }
    })
    contents.on("did-fail-load", (_event, code, description, _url, mainFrame) => {
      if (mainFrame && code !== -3) {
        this.fail(description)
      }
    })
    contents.on("render-process-gone", () => {
      this.fail("A página parou de responder. Feche o navegador e tente novamente.")

      if (contents === this.popup?.webContents) {
        this.closePopup()
      } else {
        this.close()
      }
    })
  }

  private openPopup(options: BrowserWindowConstructorOptions) {
    const popup = new WebContentsView(options)
    this.popup = popup
    this.preview.popup = true
    this.preview.image = null
    const parent = this.shown ? this.window : this.background
    parent.contentView.addChildView(popup)
    popup.setBounds(this.view.getBounds())
    popup.setVisible(this.preview.control === "user")
    popup.webContents.setWindowOpenHandler(() => ({ action: "deny" }))
    this.observe(popup.webContents)
    popup.webContents.on("before-input-event", (event, input) => {
      if (input.type === "keyDown" && input.key === "Escape") {
        event.preventDefault()
        this.window.webContents.focus()
        this.window.webContents.sendInputEvent({ type: "keyDown", keyCode: "Escape" })
      }
    })
    popup.webContents.once("destroyed", () => {
      const owner = this.shown ? this.window : this.background

      if (!owner.isDestroyed()) {
        owner.contentView.removeChildView(popup)
      }

      this.popup = undefined
      this.preview.popup = false
      this.preview.image = null

      if (!this.closed) {
        this.update()

        if (this.shown) {
          this.view.webContents.focus()
        }
      }
    })

    if (this.preview.control === "bot") {
      void this.takeControl("Conclua a interação do site e devolva o controle quando terminar.")
    } else {
      this.changed()
      popup.webContents.focus()
    }

    return popup.webContents
  }

  closePopup() {
    this.popup?.webContents.close()
  }

  private get activeView() {
    return this.popup ?? this.view
  }

  private update() {
    this.preview.url = this.activeView.webContents.getURL()
    this.preview.title = this.activeView.webContents.getTitle() || "Navegador"
    this.changed()
  }

  private fail(message: string) {
    this.preview.error = message
    this.changed()
  }

  async takeControl(reason?: string) {
    this.controlRevision += 1
    this.requestingControl = true
    await this.driver.settle()

    if (this.closed) {
      return
    }

    this.requestingControl = false
    this.preview.control = "user"
    this.popup?.setVisible(true)

    if (reason) {
      this.preview.reason = reason
    }

    this.changed()

    if (this.shown) {
      this.activeView.webContents.focus()
    }
  }

  show(bounds: BrowserBounds) {
    if (!this.shown) {
      this.background.contentView.removeChildView(this.view)
      this.window.contentView.addChildView(this.view)

      if (this.popup) {
        this.background.contentView.removeChildView(this.popup)
        this.window.contentView.addChildView(this.popup)
      }

      this.shown = true
    }

    this.view.setBounds(bounds)
    this.popup?.setBounds(bounds)

    if (this.preview.control === "user") {
      this.activeView.webContents.focus()
    }
  }

  minimize() {
    if (!this.shown) {
      return
    }

    this.window.contentView.removeChildView(this.view)
    this.background.contentView.addChildView(this.view)

    if (this.popup) {
      this.window.contentView.removeChildView(this.popup)
      this.background.contentView.addChildView(this.popup)
    }

    this.shown = false
  }

  resume() {
    if (this.popup) {
      throw new Error("Close the site popup before returning browser control")
    }

    this.controlRevision += 1
    this.preview.control = "bot"
    this.preview.reason = null

    if (!this.shown) {
      this.view.setBounds({ x: 0, y: 0, width: 1280, height: 800 })
    }

    for (const resolve of this.waiters) {
      resolve()
    }

    this.changed()
  }

  private async waitForControl(signal: AbortSignal) {
    signal.throwIfAborted()

    if ((this.requestingControl || this.preview.control === "user") && !this.closed) {
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

    const view = this.activeView
    const { width, height } = view.getBounds()
    const image = await view.webContents.capturePage({ x: 0, y: 0, width, height }, { stayHidden: true })
    const empty = image.isEmpty()

    if (!this.closed && view === this.activeView && !empty) {
      this.preview.image = image.resize({ width: 320 }).toDataURL()
    }
  }

  close() {
    if (this.closed) {
      return
    }

    this.closed = true

    this.closePopup()

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
