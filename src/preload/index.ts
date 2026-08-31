import { contextBridge, ipcRenderer } from "electron"
import { engineConnection } from "../shared/engine-contract"
import { type } from "arktype"

contextBridge.exposeInMainWorld("desktop", {
  getEngineConnection: async () => engineConnection.assert(await ipcRenderer.invoke("engine:get-connection")),
  chooseWorkingDirectory: async () => type("string > 0").or("null").assert(await ipcRenderer.invoke("working-directory:choose")),
})
