import { fileURLToPath } from "node:url"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, externalizeDepsPlugin } from "electron-vite"

const resolve = { alias: { "@src": fileURLToPath(new URL("src", import.meta.url)) } }

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
  renderer: { resolve, plugins: [tailwindcss(), react()] },
})
