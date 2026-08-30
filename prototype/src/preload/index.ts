import { contextBridge, ipcRenderer } from "electron"

contextBridge.exposeInMainWorld("prototypeHost", {
  getConnection: () => ipcRenderer.invoke("prototype:get-connection"),
})
