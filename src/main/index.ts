import { access, stat } from "node:fs/promises"
import { constants, existsSync } from "node:fs"
import { join } from "node:path"
import { app, BrowserWindow, dialog, ipcMain, shell } from "electron"
import { z } from "zod"
import { loopbackHttpUrl } from "../shared/engine-ipc"
import { parse } from "../shared/parse"
import { turnNotification } from "../shared/turn-notification"
import { startAppUpdates } from "./app-update"
import { EngineProcess } from "./engine-process/engine-process"
import { productServices } from "./product-services"
import { loadSecretKey } from "./secret-key"
import { createTurnNotifications } from "./turn-notification"

if (process.env.JOLT_USER_DATA) {
  app.setPath("userData", process.env.JOLT_USER_DATA)
}

app.setName(app.isPackaged ? "Jolt" : "Jolt Dev")

const environmentFile = join(app.getAppPath(), ".env")

if (!app.isPackaged && existsSync(environmentFile)) {
  process.loadEnvFile(environmentFile)
}

const icon = join(app.getAppPath(), "resources", app.isPackaged ? "icon.png" : "icon-dev.png")
const engineName = process.platform === "win32" ? "jolt-engine.exe" : "jolt-engine"
const executable = app.isPackaged
  ? join(process.resourcesPath, "engine", engineName)
  : join(app.getAppPath(), "dist-engine", engineName)
const engine = new EngineProcess({
  executable,
  databasePath: join(app.getPath("userData"), "jolt.sqlite"),
  privateBotsDirectory: join(app.getPath("userData"), "bots"),
  secretKey: () => loadSecretKey(join(app.getPath("userData"), "secret.key")),
  ...(process.env.JOLT_GOOGLE_CLIENT_ID ? { googleClient: { id: process.env.JOLT_GOOGLE_CLIENT_ID, ...(process.env.JOLT_GOOGLE_CLIENT_SECRET ? { secret: process.env.JOLT_GOOGLE_CLIENT_SECRET } : {}) } } : {}),
  githubRelayUrl: process.env.JOLT_GITHUB_RELAY_URL ?? productServices.githubRelayUrl,
  appVersion: app.getVersion(),
  electronVersion: process.versions.electron,
  development: !app.isPackaged,
  loadProvider: !app.isPackaged && process.env.JOLT_LOAD_PROVIDER === "true",
  onUnexpectedExit(error) {
    console.error(error)
    app.quit()
  },
})

if (!app.isPackaged) {
  app.commandLine.appendSwitch("remote-debugging-port", "9222")
}

void app.whenReady().then(async () => {
  const starting = engine.start()

  ipcMain.handle("engine:get-connection", () => starting)

  const window = new BrowserWindow({
    width: 960,
    height: 760,
    frame: false,
    icon,
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
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
})

let engineStopped = false

app.on("before-quit", (event) => {
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
