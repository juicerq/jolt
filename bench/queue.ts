import { parseArgs } from "node:util"
import { z } from "zod"
import { connectCdp } from "./cdp"

const { values } = parseArgs({ args: Bun.argv.slice(2), options: { port: { type: "string", default: "9222" } } })
const cdp = await connectCdp(values.port)
const text = z.string()
const numbers = z.array(z.string())
const checks: { name: string; ok: boolean; detail: string }[] = []

async function snapshot() {
  return cdp.evaluate(`(() => {
    const fila = document.querySelector('[aria-label="Fila de mensagens"]')
    const rows = fila ? [...fila.querySelectorAll("li")].map((row) => row.textContent) : []
    const bubbles = [...document.querySelectorAll("p.whitespace-pre-wrap")].map((node) => node.textContent)
    const stop = !!document.querySelector('button[aria-label^="Interromper"], button[aria-label^="Interrompendo"]')
    const editor = document.querySelector('[role="combobox"]')
    return JSON.stringify({ rows, bubbles, stop, editable: editor?.getAttribute("contenteditable") })
  })()`, text).then((raw) => JSON.parse(raw) as { rows: string[]; bubbles: string[]; stop: boolean; editable: string | null })
}

async function type(content: string) {
  await cdp.call("Runtime.evaluate", z.unknown(), { expression: `document.querySelector('[role="combobox"]').focus()` })
  await cdp.call("Input.insertText", z.unknown(), { text: content })
}

async function press(key: string, modifiers: number) {
  for (const type of ["keyDown", "keyUp"]) {
    await cdp.call("Input.dispatchKeyEvent", z.unknown(), { type, key, code: key, windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, modifiers })
  }
}

async function click(label: string) {
  await cdp.evaluate(`(() => {
    const button = [...document.querySelectorAll("button")].find((node) => node.getAttribute("aria-label") === ${JSON.stringify(label)})
    if (!button) { return "missing" }
    button.click()
    return "clicked"
  })()`, text)
}

async function until(name: string, holds: (state: Awaited<ReturnType<typeof snapshot>>) => boolean, timeoutMs = 15_000) {
  const startedAt = performance.now()
  let state = await snapshot()

  while (!holds(state) && performance.now() - startedAt < timeoutMs) {
    await Bun.sleep(200)
    state = await snapshot()
  }

  checks.push({ name, ok: holds(state), detail: JSON.stringify(state) })

  return state
}

await cdp.evaluate(`(() => {
  const bot = [...document.querySelectorAll("button")].find((node) => (node.textContent ?? "").includes("Leve"))
  bot?.click()
  return bot ? "ok" : "missing"
})()`, text)
await Bun.sleep(1_500)

await type("primeira mensagem do teste")
await press("Enter", 0)
await until("o Turno começou", (state) => state.stop)

const working = await snapshot()

checks.push({ name: "o composer continua editável durante o Turno", ok: working.editable === "true", detail: String(working.editable) })

await type("segunda mensagem enfileirada")
await press("Enter", 0)
await until("a Fila mostra a enfileirada", (state) => state.rows.some((row) => row.includes("segunda mensagem")))
await click("Enviar agora")
await until("promover entrega a enfileirada", (state) => state.bubbles.some((bubble) => bubble.includes("segunda mensagem")) && !state.rows.some((row) => row.includes("segunda mensagem")))

await type("terceira mensagem adiantada")
await press("Enter", 2)
await until("a mensagem adiantada entrou na Conversa", (state) => state.bubbles.some((bubble) => bubble.includes("terceira mensagem")))

await until("o Turno terminou", (state) => !state.stop, 60_000)

await type("quarta mensagem para drenar")
await press("Enter", 0)
await until("o Turno seguinte começou", (state) => state.stop)

await type("quinta mensagem enfileirada")
await press("Enter", 0)
await until("a Fila guardou a quinta", (state) => state.rows.some((row) => row.includes("quinta mensagem")))
await until("a Fila drena sozinha quando o Turno acaba", (state) => state.bubbles.some((bubble) => bubble.includes("quinta mensagem")), 60_000)

await until("o Turno drenado terminou", (state) => !state.stop, 60_000)
await type("sexta mensagem para remover")
await press("Enter", 0)
await type("sétima mensagem removida")
await press("Enter", 0)
await until("a Fila guardou a sétima", (state) => state.rows.some((row) => row.includes("sétima mensagem")))
await click("Remover da fila")
await until("remover tira a mensagem da Fila", (state) => !state.rows.some((row) => row.includes("sétima mensagem")))

for (const check of checks) {
  console.log(`${check.ok ? "ok  " : "FALHA"} ${check.name}${check.ok ? "" : ` — ${check.detail}`}`)
}

console.log(checks.every((check) => check.ok) ? "\ntodas as verificações passaram" : "\nhouve falhas")
cdp.close()
process.exit(checks.every((check) => check.ok) ? 0 : 1)
