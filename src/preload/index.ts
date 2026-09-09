import { contextBridge, ipcRenderer } from "electron"
import type { BrowserState } from "../shared/browser"
import type { Desktop } from "../shared/desktop"

const desktop: Desktop = {
  remote: false,
  fileAction: (request) => ipcRenderer.invoke("file:action", request),
  openBotBrowser: (input) => ipcRenderer.invoke("agent-browser:open", input),
  getBrowserState: () => ipcRenderer.invoke("agent-browser:state"),
  watchBrowser: (botId) => ipcRenderer.invoke("agent-browser:watch", botId),
  takeBrowserControl: (botId) => ipcRenderer.invoke("agent-browser:take-control", botId),
  setBrowserBounds: (bounds) => ipcRenderer.invoke("agent-browser:bounds", bounds),
  resumeBrowser: (botId) => ipcRenderer.invoke("agent-browser:resume", botId),
  minimizeBrowser: () => ipcRenderer.invoke("agent-browser:minimize"),
  closeBrowser: (botId) => ipcRenderer.invoke("agent-browser:close", botId),
  closeBrowserPopup: (botId) => ipcRenderer.invoke("agent-browser:close-popup", botId),
  onBrowserState: (listener) => {
    ipcRenderer.on("agent-browser:state", (_event, state: BrowserState) => listener(state))
  },
  getEngineConnection: () => ipcRenderer.invoke("engine:get-connection"),
  renewEngineConnection: () => ipcRenderer.invoke("engine:get-connection"),
  getMobileAccess: () => ipcRenderer.invoke("mobile-access:get"),
  configureMobileAccess: (update) => ipcRenderer.invoke("mobile-access:configure", update),
  unpairMobileAccess: () => ipcRenderer.invoke("mobile-access:unpair"),
  chooseWorkingDirectory: () => ipcRenderer.invoke("working-directory:choose"),
  minimizeWindow: () => ipcRenderer.invoke("window:minimize"),
  toggleMaximizeWindow: () => ipcRenderer.invoke("window:toggle-maximize"),
  closeWindow: () => ipcRenderer.invoke("window:close"),
  openInBrowser: (url) => ipcRenderer.invoke("browser:open", url),
  notifyTurnFinished: (notification) => ipcRenderer.invoke("notification:turn-finished", notification),
  onTurnNotificationOpened: (listener) => {
    ipcRenderer.on("notification:open-conversation", (_event, botId: string) => listener(botId))
  },
  installUpdate: () => ipcRenderer.invoke("update:install"),
  onUpdateReady: (listener) => {
    ipcRenderer.on("update:ready", () => listener())
  },
}

contextBridge.exposeInMainWorld("desktop", desktop)
