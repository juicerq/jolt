import { app, ipcMain, type BrowserWindow } from "electron"
import electronUpdater from "electron-updater"
import type { EngineProcess } from "./engine-process/engine-process"

type UpdateWindow = Pick<BrowserWindow, "webContents">
type UpdateReporter = Pick<EngineProcess, "event">

const checkIntervalMs = 10 * 60_000

export async function startAppUpdates({ window, engine }: { window: UpdateWindow; engine: UpdateReporter }) {
  if (!app.isPackaged) {
    return
  }

  const { autoUpdater } = electronUpdater

  function check() {
    return autoUpdater.checkForUpdates().catch(() => {})
  }

  ipcMain.handle("update:install", () => autoUpdater.quitAndInstall())

  const checks = setInterval(() => void check(), checkIntervalMs)

  autoUpdater.on("update-downloaded", ({ version }) => {
    clearInterval(checks)
    window.webContents.send("update:ready")
    void engine.event({ name: "main.updatedownloaded", attributes: { process: "main", status: "ready", version } })
  })
  autoUpdater.on("error", (error) => {
    void engine.event({ name: "main.updatefailed", attributes: { process: "main", status: "failed", reason: error.message } })
  })

  await check()
}
