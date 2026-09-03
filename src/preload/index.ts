import { contextBridge, ipcRenderer } from "electron"
import type { EngineConnection } from "../shared/engine-ipc"
import type { TurnNotification } from "../shared/turn-notification"

contextBridge.exposeInMainWorld("desktop", {
  getEngineConnection: (): Promise<EngineConnection> => ipcRenderer.invoke("engine:get-connection"),
  chooseWorkingDirectory: (): Promise<string | null> => ipcRenderer.invoke("working-directory:choose"),
  minimizeWindow: (): Promise<void> => ipcRenderer.invoke("window:minimize"),
  toggleMaximizeWindow: (): Promise<void> => ipcRenderer.invoke("window:toggle-maximize"),
  closeWindow: (): Promise<void> => ipcRenderer.invoke("window:close"),
  openInBrowser: (url: string): Promise<void> => ipcRenderer.invoke("browser:open", url),
  notifyTurnFinished: (notification: TurnNotification): Promise<void> => ipcRenderer.invoke("notification:turn-finished", notification),
})
