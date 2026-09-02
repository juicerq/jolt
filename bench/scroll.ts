import { parseArgs } from "node:util"
import { browser, evaluate } from "./browser"
import { startProbe, stopProbe, summarizeFrames } from "./page-probe"

const { values } = parseArgs({ args: Bun.argv.slice(2), options: { port: { type: "string", default: "9222" }, steps: { type: "string", default: "40" }, px: { type: "string", default: "1200" } } })
const bots = ["Leve", "Enorme"]
const steps = Number(values.steps)
const px = Number(values.px)

type Viewport = { scrollTop: number; scrollHeight: number }

function viewport() {
  return evaluate<Viewport>(`(() => {
    const element = document.querySelector("[aria-live=polite]")
    return JSON.stringify({ scrollTop: element.scrollTop, scrollHeight: element.scrollHeight })
  })()`)
}

function scrollUp(count: number) {
  for (let step = 0; step < count; step += 1) {
    evaluate<string>(`(() => { document.querySelector("[aria-live=polite]").scrollBy({ top: -${px}, behavior: "smooth" }); return JSON.stringify("ok") })()`)
  }
}

function revealEarlier() {
  evaluate<string>(`(() => {
    const button = [...document.querySelectorAll("button")].find((element) => element.textContent.includes("Mostrar mensagens anteriores"))
    button.click()
    return JSON.stringify("ok")
  })()`)
}

function measure(name: string) {
  browser("find", "role", "button", "click", "--name", `de ${name} com`)
  Bun.sleepSync(1_000)

  const start = viewport()
  startProbe()
  scrollUp(steps)
  Bun.sleepSync(500)

  const beforeReveal = viewport()
  revealEarlier()
  Bun.sleepSync(1_000)

  const afterReveal = viewport()
  scrollUp(steps)
  Bun.sleepSync(500)

  const end = viewport()
  const probe = stopProbe()

  return {
    conversa: name,
    passos: steps * 2,
    scrolledPx: Math.round(start.scrollTop - beforeReveal.scrollTop + afterReveal.scrollTop - end.scrollTop),
    revealedPx: Math.round(afterReveal.scrollHeight - beforeReveal.scrollHeight),
    ...summarizeFrames(probe),
  }
}

browser("connect", values.port)

console.table(bots.map(measure))
