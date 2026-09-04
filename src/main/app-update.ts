import { app, ipcMain, type BrowserWindow } from "electron"
import electronUpdater from "electron-updater"
import type { EngineProcess } from "./engine-process/engine-process"

type UpdateWindow = Pick<BrowserWindow, "webContents" | "on" | "off">
type UpdateReporter = Pick<EngineProcess, "event">

const checkIntervalMs = 10 * 60_000
const focusFloorMs = 60_000

export async function startAppUpdates({ window, engine }: { window: UpdateWindow; engine: UpdateReporter }) {
  if (!app.isPackaged) {
    return
  }

  const { autoUpdater } = electronUpdater
  let lastCheckAt = 0

  function check() {
    lastCheckAt = Date.now()

    return autoUpdater.checkForUpdates().catch(() => {})
  }

  function checkOnFocus() {
    if (Date.now() - lastCheckAt < focusFloorMs) {
      return
    }

    void check()
  }

  ipcMain.handle("update:install", () => autoUpdater.quitAndInstall())

  const checks = setInterval(() => void check(), checkIntervalMs)
  window.on("focus", checkOnFocus)

  autoUpdater.on("update-downloaded", ({ version }) => {
    clearInterval(checks)
    window.off("focus", checkOnFocus)
    window.webContents.send("update:ready")
    void engine.event({ name: "main.updatedownloaded", attributes: { process: "main", status: "ready", version } })
  })
  autoUpdater.on("error", (error) => {
    void engine.event({ name: "main.updatefailed", attributes: { process: "main", status: "failed", reason: error.message } })
  })

  await check()
}
