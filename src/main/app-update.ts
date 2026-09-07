import { app, ipcMain, type BrowserWindow } from "electron"
import electronUpdater from "electron-updater"
import type { EngineProcess } from "./engine-process/engine-process"

type UpdateWindow = Pick<BrowserWindow, "webContents" | "on">
type UpdateReporter = Pick<EngineProcess, "event">

const checkIntervalMs = 10 * 60_000
const focusFloorMs = 60_000

export async function startAppUpdates({ window, engine }: { window: UpdateWindow; engine: UpdateReporter }) {
  if (!app.isPackaged) {
    return
  }

  const { autoUpdater } = electronUpdater
  let lastCheckAt = 0
  let activity: Promise<unknown> = Promise.resolve()
  let readyVersion: string | null = null

  function check() {
    lastCheckAt = Date.now()
    activity = autoUpdater
      .checkForUpdates()
      .then((result) => result?.downloadPromise)
      .catch(() => null)

    return activity
  }

  function checkOnFocus() {
    if (Date.now() - lastCheckAt < focusFloorMs) {
      return
    }

    void check()
  }

  ipcMain.handle("update:install", async () => {
    await activity

    if (readyVersion) {
      autoUpdater.quitAndInstall()
    }
  })

  setInterval(() => void check(), checkIntervalMs)
  window.on("focus", checkOnFocus)

  autoUpdater.on("update-available", ({ version }) => {
    if (version !== readyVersion) {
      readyVersion = null
      autoUpdater.autoInstallOnAppQuit = false
    }
  })
  autoUpdater.on("update-downloaded", ({ version }) => {
    if (version === readyVersion) {
      return
    }

    readyVersion = version
    autoUpdater.autoInstallOnAppQuit = true
    window.webContents.send("update:ready")
    void engine.event({ name: "main.updatedownloaded", attributes: { process: "main", status: "ready", version } })
  })
  autoUpdater.on("error", (error) => {
    void engine.event({ name: "main.updatefailed", attributes: { process: "main", status: "failed", reason: error.message } })
  })

  await check()
}
