import { contextBridge, ipcRenderer } from "electron"
import { engineConnection } from "../shared/engine-contract"

contextBridge.exposeInMainWorld("desktop", {
  getEngineConnection: async () => engineConnection.assert(await ipcRenderer.invoke("engine:get-connection")),
})
