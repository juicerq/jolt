import { contextBridge, ipcRenderer } from "electron"
import type { BrowserState, BrowserBounds } from "../shared/browser"
import type { EngineConnection } from "../shared/engine-ipc"
import type { TurnNotification } from "../shared/turn-notification"

contextBridge.exposeInMainWorld("desktop", {
  getBrowserState: (): Promise<BrowserState> => ipcRenderer.invoke("agent-browser:state"),
  watchBrowser: (botId: string): Promise<void> => ipcRenderer.invoke("agent-browser:watch", botId),
  takeBrowserControl: (botId: string): Promise<void> => ipcRenderer.invoke("agent-browser:take-control", botId),
  setBrowserBounds: (bounds: BrowserBounds): Promise<void> => ipcRenderer.invoke("agent-browser:bounds", bounds),
  resumeBrowser: (botId: string): Promise<void> => ipcRenderer.invoke("agent-browser:resume", botId),
  minimizeBrowser: (): Promise<void> => ipcRenderer.invoke("agent-browser:minimize"),
  closeBrowser: (botId: string): Promise<void> => ipcRenderer.invoke("agent-browser:close", botId),
  closeBrowserPopup: (botId: string): Promise<void> => ipcRenderer.invoke("agent-browser:close-popup", botId),
  onBrowserState: (listener: (state: BrowserState) => void): void => {
    ipcRenderer.on("agent-browser:state", (_event, state: BrowserState) => listener(state))
  },
  getEngineConnection: (): Promise<EngineConnection> => ipcRenderer.invoke("engine:get-connection"),
  chooseWorkingDirectory: (): Promise<string | null> => ipcRenderer.invoke("working-directory:choose"),
  minimizeWindow: (): Promise<void> => ipcRenderer.invoke("window:minimize"),
  toggleMaximizeWindow: (): Promise<void> => ipcRenderer.invoke("window:toggle-maximize"),
  closeWindow: (): Promise<void> => ipcRenderer.invoke("window:close"),
  openInBrowser: (url: string): Promise<void> => ipcRenderer.invoke("browser:open", url),
  notifyTurnFinished: (notification: TurnNotification): Promise<void> => ipcRenderer.invoke("notification:turn-finished", notification),
  onTurnNotificationOpened: (listener: (botId: string) => void): void => {
    ipcRenderer.on("notification:open-conversation", (_event, botId: string) => listener(botId))
  },
  installUpdate: (): Promise<void> => ipcRenderer.invoke("update:install"),
  onUpdateReady: (listener: () => void): void => {
    ipcRenderer.on("update:ready", () => listener())
  },
})
