import { access, stat } from "node:fs/promises"
import { constants } from "node:fs"
import { join } from "node:path"
import { app, BrowserWindow, dialog, ipcMain, shell } from "electron"
import { z } from "zod"
import { loopbackHttpUrl } from "../shared/engine-ipc"
import { parse } from "../shared/parse"
import { turnNotification } from "../shared/turn-notification"
import { startAppUpdates } from "./app-update"
import { EngineProcess } from "./engine-process/engine-process"
import { Browser } from "./browser/browser"
import { browserDebuggingPort } from "./browser/browser-debugging"
import { productServices } from "./product-services"
import { loadSecretKey } from "./secret-key"
import { createTurnNotifications } from "./turn-notification"

if (process.env.MIMO_USER_DATA) {
  app.setPath("userData", process.env.MIMO_USER_DATA)
}

app.setName(app.isPackaged ? "Mimo" : "Mimo Dev")

if (process.platform === "linux" && !app.isPackaged) {
  app.setDesktopName("mimo-dev.desktop")
}

if (!app.requestSingleInstanceLock()) {
  app.exit(0)
}

const background = process.argv.includes("--background")
let showOnReady = !background
let mainWindow: BrowserWindow | undefined
let quitting = false

function showMainWindow() {
  if (!mainWindow) {
    return
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore()
  }

  mainWindow.show()
  mainWindow.focus()
}

app.on("second-instance", (_event, argv) => {
  if (!argv.includes("--background")) {
    showOnReady = true
    showMainWindow()
  }
})
app.on("activate", showMainWindow)

const icon = join(app.getAppPath(), "resources", app.isPackaged ? "icon.png" : "icon-dev.png")
const engineName = process.platform === "win32" ? "mimo-engine.exe" : "mimo-engine"
const executable = app.isPackaged
  ? join(process.resourcesPath, "engine", engineName)
  : join(app.getAppPath(), "dist-engine", engineName)
let browser: Browser | undefined

const engine = new EngineProcess({
  browser: (request, signal) => {
    if (!browser) {
      return Promise.reject(new Error("Browser is not ready"))
    }

    return browser.execute(request, signal)
  },
  executable,
  databasePath: join(app.getPath("userData"), "mimo.sqlite"),
  privateBotsDirectory: join(app.getPath("userData"), "bots"),
  secretKey: () => loadSecretKey(join(app.getPath("userData"), "secret.key")),
  ...(import.meta.env.MAIN_VITE_GOOGLE_CLIENT_ID ? { googleClient: { id: import.meta.env.MAIN_VITE_GOOGLE_CLIENT_ID, ...(import.meta.env.MAIN_VITE_GOOGLE_CLIENT_SECRET ? { secret: import.meta.env.MAIN_VITE_GOOGLE_CLIENT_SECRET } : {}) } } : {}),
  githubRelayUrl: process.env.MIMO_GITHUB_RELAY_URL ?? productServices.githubRelayUrl,
  appVersion: app.getVersion(),
  electronVersion: process.versions.electron,
  development: !app.isPackaged,
  loadProvider: !app.isPackaged && process.env.MIMO_LOAD_PROVIDER === "true",
  onUnexpectedExit(error) {
    console.error(error)
    app.exit(1)
  },
})

app.commandLine.appendSwitch("remote-debugging-address", "127.0.0.1")
app.commandLine.appendSwitch("remote-debugging-port", await browserDebuggingPort())

void app.whenReady().then(async () => {
  const starting = engine.start()

  ipcMain.handle("engine:get-connection", () => starting)

  const window = new BrowserWindow({
    width: 960,
    height: 760,
    frame: false,
    icon,
    show: false,
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  mainWindow = window

  if (showOnReady) {
    window.maximize()
    showMainWindow()
  }

  window.on("close", (event) => {
    if (background && !quitting) {
      event.preventDefault()
      window.hide()
    }
  })
  browser = new Browser(window)
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }))
  window.webContents.on("will-navigate", (event) => event.preventDefault())
  const notifications = createTurnNotifications({
    window,
    icon,
    openConversation: (botId) => window.webContents.send("notification:open-conversation", botId),
  })

  ipcMain.handle("notification:turn-finished", (_event, raw: unknown) => notifications.show(parse(turnNotification, raw)))
  ipcMain.handle("window:minimize", () => window.minimize())
  ipcMain.handle("window:toggle-maximize", () => window.isMaximized() ? window.unmaximize() : window.maximize())
  ipcMain.handle("window:close", () => window.close())
  ipcMain.handle("browser:open", async (_event, rawUrl: unknown) => {
    const url = parse(z.url({ protocol: /^https$/ }), rawUrl)

    await shell.openExternal(url)
  })
  ipcMain.handle("working-directory:choose", async () => {
    const selection = parse(z.object({ canceled: z.boolean(), filePaths: z.array(z.string()) }), await dialog.showOpenDialog(window, {
      properties: ["openDirectory", "createDirectory"],
    }))

    if (selection.canceled) {
      return null
    }

    const path = selection.filePaths.at(0)
    const directory = path ? await stat(path).catch(() => {}) : undefined

    if (!path || !directory?.isDirectory()) {
      throw new Error("The selected working directory is invalid")
    }

    await access(path, constants.R_OK | constants.W_OK)

    return path
  })

  const loading = !app.isPackaged && process.env.ELECTRON_RENDERER_URL
    ? window.loadURL(parse(loopbackHttpUrl, process.env.ELECTRON_RENDERER_URL))
    : window.loadFile(join(__dirname, "../renderer/index.html"))

  await starting
  await engine.event({ name: "main.started", attributes: { process: "main", status: "ready", version: app.getVersion() } })
  await loading

  await startAppUpdates({ window, engine })
}).catch(async (error) => {
  console.error(error)
  await engine.stop()
  app.exit(1)
})

let engineStopped = false

app.on("before-quit", (event) => {
  quitting = true

  if (engineStopped) {
    return
  }

  event.preventDefault()
  void engine.event({ name: "main.stopped", attributes: { process: "main", status: "stopping" } }).then(() => engine.stop()).then(() => {
    engineStopped = true
    app.quit()
  })
})
app.on("window-all-closed", () => app.quit())
