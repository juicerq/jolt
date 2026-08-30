import { randomBytes } from "node:crypto"
import { fork, spawn, type ChildProcess } from "node:child_process"
import { mkdirSync } from "node:fs"
import { join } from "node:path"
import { app, BrowserWindow, ipcMain } from "electron"
import { type } from "arktype"
import { engineReadyMessage } from "../shared/contract"

let engine: ChildProcess | undefined

async function startEngine() {
  const token = randomBytes(32).toString("hex")
  const prototypeDirectory = join(app.getPath("temp"), "harness-bun-engine-prototype")
  const databasePath = join(prototypeDirectory, "PROTOTYPE-WIPE-ME.sqlite")
  const compiled = process.env.PROTOTYPE_ENGINE_MODE === "compiled"
  const entry = compiled
    ? join(app.getAppPath(), "dist-engine/harness-prototype-engine")
    : join(app.getAppPath(), "src/engine/index.ts")

  mkdirSync(prototypeDirectory, { recursive: true })

  const options = {
    env: {
      ...process.env,
      PROTOTYPE_TOKEN: token,
      PROTOTYPE_DATABASE_PATH: databasePath,
    },
    stdio: ["ignore", "inherit", "inherit", "ipc"] as ["ignore", "inherit", "inherit", "ipc"],
  }

  engine = compiled ? spawn(entry, [], options) : fork(entry, [], { ...options, execPath: "bun" })

  return await new Promise<{ url: string; token: string }>((resolve, reject) => {
    engine?.once("error", reject)
    engine?.on("message", (message) => {
      const parsed = engineReadyMessage(message)

      if (parsed instanceof type.errors) {
        reject(new Error(`Invalid Bun engine ready message: ${parsed.summary}`))

        return
      }

      resolve({ url: `http://127.0.0.1:${parsed.port}/rpc`, token })
    })
  })
}

app.whenReady().then(async () => {
  const connection = await startEngine()

  ipcMain.handle("prototype:get-connection", () => connection)

  const window = new BrowserWindow({
    width: 960,
    height: 680,
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    await window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    await window.loadFile(join(__dirname, "../renderer/index.html"))
  }
})

app.on("before-quit", () => {
  engine?.kill("SIGTERM")
})

app.on("window-all-closed", () => {
  app.quit()
})
