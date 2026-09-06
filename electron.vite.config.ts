import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, externalizeDepsPlugin } from "electron-vite"

const resolve = { alias: { "@src": fileURLToPath(new URL("src", import.meta.url)) } }
const devConnectionPath = join(process.env.MIMO_USER_DATA ?? join(homedir(), ".config", "mimo-dev"), "engine-connection.json")

// Entrega a conexão do engine ao renderer aberto num navegador (celular via `bun run dev:mobile`).
const devConnection = {
  name: "mimo-dev-connection",
  configureServer(server: { middlewares: { use(path: string, handler: (req: unknown, res: { statusCode: number; setHeader(name: string, value: string): void; end(body?: string): void }) => void): void } }) {
    server.middlewares.use("/engine-connection.json", (_req, res) => {
      readFile(devConnectionPath, "utf8").then((body) => {
        res.setHeader("content-type", "application/json")
        res.end(body)
      }, () => {
        res.statusCode = 404
        res.end()
      })
    })
  },
}

export default defineConfig({
  main: { resolve, plugins: [externalizeDepsPlugin()] },
  preload: {
    resolve,
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        external: ["electron"],
        output: { format: "cjs", entryFileNames: "[name].cjs" },
      },
    },
  },
  renderer: { resolve, plugins: [tailwindcss(), react(), devConnection] },
})
