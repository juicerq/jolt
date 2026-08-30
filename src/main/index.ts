import { join } from "node:path"
import { app, BrowserWindow, ipcMain } from "electron"
import { loopbackHttpUrl } from "../shared/engine-contract"
import { EngineProcess } from "./engine-process/engine-process"

const executable = app.isPackaged
  ? join(process.resourcesPath, "engine", "bot-teams-engine")
  : join(app.getAppPath(), "dist-engine", "bot-teams-engine")
const engine = new EngineProcess({
  executable,
  databasePath: join(app.getPath("userData"), "bot-teams.sqlite"),
  onUnexpectedExit(error) {
    console.error(error)
    app.quit()
  },
})

app.whenReady().then(async () => {
  const connection = await engine.start()

  ipcMain.handle("engine:get-connection", () => connection)

  const window = new BrowserWindow({
    width: 1100,
    height: 760,
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }))
  window.webContents.on("will-navigate", (event) => event.preventDefault())

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
  engine.stop().then(() => {
    engineStopped = true
    app.quit()
  })
})
app.on("window-all-closed", () => app.quit())
