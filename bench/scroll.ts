import { parseArgs } from "node:util"
import { browser, connectBrowser, evaluate } from "./browser"
import { startProbe, stopProbe, summarizeFrames } from "./page-probe"

const { values } = parseArgs({ args: Bun.argv.slice(2), options: { port: { type: "string", default: "9222" }, steps: { type: "string", default: "40" }, px: { type: "string", default: "1200" } } })
const bots = ["Leve", "Enorme"]
const steps = Number(values.steps)
const px = Number(values.px)

interface Viewport { scrollTop: number; scrollHeight: number }

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

function measure(name: string) {
  browser("find", "role", "button", "click", "--name", `de ${name} com`)
  Bun.sleepSync(1_000)

  const start = viewport()
  startProbe()
  scrollUp(steps * 2)
  Bun.sleepSync(1_000)

  const end = viewport()
  const probe = stopProbe()

  return {
    conversa: name,
    passos: steps * 2,
    revealedPx: Math.round(end.scrollHeight - start.scrollHeight),
    ...summarizeFrames(probe),
  }
}

connectBrowser(values.port)

console.table(bots.map(measure))
