import { access, stat } from "node:fs/promises"
import { constants } from "node:fs"
import { join } from "node:path"
import { app, BrowserWindow, dialog, ipcMain } from "electron"
import { type } from "arktype"
import { loopbackHttpUrl } from "../shared/engine-contract"
import { EngineProcess } from "./engine-process/engine-process"

if (process.env.JOLT_USER_DATA) {
  app.setPath("userData", process.env.JOLT_USER_DATA)
}

const executable = app.isPackaged
  ? join(process.resourcesPath, "engine", "jolt-engine")
  : join(app.getAppPath(), "dist-engine", "jolt-engine")
const engine = new EngineProcess({
  executable,
  databasePath: join(app.getPath("userData"), "jolt.sqlite"),
  privateBotsDirectory: join(app.getPath("userData"), "bots"),
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

app.whenReady().then(async () => {
  const connection = await engine.start()
  await engine.event({ name: "main.started", attributes: { process: "main", status: "ready", version: app.getVersion() } })

  ipcMain.handle("engine:get-connection", () => connection)

  const window = new BrowserWindow({
    width: 1100,
    height: 760,
    frame: false,
    icon: join(app.getAppPath(), "resources", app.isPackaged ? "icon.png" : "icon-dev.png"),
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }))
  window.webContents.on("will-navigate", (event) => event.preventDefault())
  ipcMain.handle("window:minimize", () => window.minimize())
  ipcMain.handle("window:toggle-maximize", () => window.isMaximized() ? window.unmaximize() : window.maximize())
  ipcMain.handle("window:close", () => window.close())
  ipcMain.handle("working-directory:choose", async () => {
    const selection = type({ "+": "delete", canceled: "boolean", filePaths: "string[]" }).assert(await dialog.showOpenDialog(window, {
      properties: ["openDirectory", "createDirectory"],
    }))

    if (selection.canceled) {
      return null
    }

    const path = selection.filePaths.at(0)
    const directory = path ? await stat(path).catch(() => undefined) : undefined

    if (!path || !directory?.isDirectory()) {
      throw new Error("The selected working directory is invalid")
    }

    await access(path, constants.R_OK | constants.W_OK)

    return path
  })

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    await window.loadURL(loopbackHttpUrl.assert(process.env.ELECTRON_RENDERER_URL))
  } else {
    await window.loadFile(join(__dirname, "../renderer/index.html"))
  }
})

let engineStopped = false

app.on("before-quit", (event) => {
  if (engineStopped) {
    return
  }

  event.preventDefault()
  engine.event({ name: "main.stopped", attributes: { process: "main", status: "stopping" } }).then(() => engine.stop()).then(() => {
    engineStopped = true
    app.quit()
  })
})
app.on("window-all-closed", () => app.quit())
