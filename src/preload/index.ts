import { contextBridge, ipcRenderer } from "electron"
import type { engineConnection } from "../shared/engine-contract"

contextBridge.exposeInMainWorld("desktop", {
  getEngineConnection: (): Promise<typeof engineConnection.infer> => ipcRenderer.invoke("engine:get-connection"),
  chooseWorkingDirectory: (): Promise<string | null> => ipcRenderer.invoke("working-directory:choose"),
  minimizeWindow: (): Promise<void> => ipcRenderer.invoke("window:minimize"),
  toggleMaximizeWindow: (): Promise<void> => ipcRenderer.invoke("window:toggle-maximize"),
  closeWindow: (): Promise<void> => ipcRenderer.invoke("window:close"),
})
