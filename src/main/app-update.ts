import { app, ipcMain, type BrowserWindow } from "electron"
import electronUpdater from "electron-updater"
import type { EngineProcess } from "./engine-process/engine-process"

type UpdateWindow = Pick<BrowserWindow, "webContents">
type UpdateReporter = Pick<EngineProcess, "event">

export async function startAppUpdates({ window, engine }: { window: UpdateWindow; engine: UpdateReporter }) {
  if (!app.isPackaged) {
    return
  }

  const { autoUpdater } = electronUpdater

  ipcMain.handle("update:install", () => autoUpdater.quitAndInstall())

  autoUpdater.on("update-downloaded", ({ version }) => {
    window.webContents.send("update:ready")
    engine.event({ name: "main.updatedownloaded", attributes: { process: "main", status: "ready", version } })
  })
  autoUpdater.on("error", (error) => {
    engine.event({ name: "main.updatefailed", attributes: { process: "main", status: "failed", reason: error.message } })
  })

  await autoUpdater.checkForUpdates()
}
