import { $ } from "bun"
import { homedir } from "node:os"
import { join } from "node:path"

// Abre o Mimo dev no celular: `adb reverse` faz o localhost do celular apontar para o PC,
// então as checagens de loopback/CORS do engine continuam valendo sem mudança.
const userData = process.env.MIMO_USER_DATA ?? join(homedir(), ".config", "mimo-dev")
const file = Bun.file(join(userData, "engine-connection.json"))

if (!(await file.exists())) {
  throw new Error(`Sem ${file.name}. Rode \`bun run dev\` primeiro (o main grava a conexão ao subir o engine).`)
}

const { url, rendererUrl } = (await file.json()) as { url: string; rendererUrl?: string }

if (!rendererUrl) {
  throw new Error("Conexão sem rendererUrl: o Mimo precisa estar rodando em modo dev (electron-vite dev).")
}

const ports = [new URL(rendererUrl).port, new URL(url).port]
const devices = (await $`adb devices`.text()).split("\n").slice(1).filter((line) => line.endsWith("\tdevice")).map((line) => line.split("\t")[0])

if (devices.length === 0) {
  throw new Error("Nenhum celular autorizado no adb. Conecte por USB (depuração USB ligada) ou `cel pair` para Wi-Fi.")
}

for (const serial of devices) {
  for (const port of ports) {
    await $`adb -s ${serial} reverse tcp:${port} tcp:${port}`
  }

  const target = `http://localhost:${ports[0]}`
  await $`adb -s ${serial} shell am start -a android.intent.action.VIEW -d ${target}`.quiet()
  console.log(`${serial}: ${target} (portas ${ports.join(", ")} espelhadas)`)
}
