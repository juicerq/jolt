import { parseArgs } from "node:util"
import { browser, connectBrowser } from "./browser"
import { isOpenSpan, observationLog, observations, percentile, waitForObservations } from "./observations"

const { values } = parseArgs({ args: Bun.argv.slice(2), options: { "user-data": { type: "string", default: ".mimo-load" }, rounds: { type: "string", default: "3" }, port: { type: "string", default: "9222" } } })
const logPath = observationLog(values["user-data"])
const route = ["Leve", "Média", "Pesada", "Enorme", "Coordenador", "Pesquisador", "Leve", "Enorme", "Pesada", "Média"]
const rounds = Number(values.rounds)

interface OpenSpan { name: string; durationMs: number; count: number; state: string }

connectBrowser(values.port)

const initial = (await observations(logPath)).filter(isOpenSpan).length
browser("find", "role", "button", "click", "--name", "de Pesquisador com")

const collected: OpenSpan[] = []
const before = (await waitForObservations(logPath, isOpenSpan, initial, 30_000)).length

for (let round = 0; round < rounds; round += 1) {
  for (const name of route) {
    const seen = before + collected.length
    browser("find", "role", "button", "click", "--name", `de ${name} com`)
    const span = (await waitForObservations(logPath, isOpenSpan, seen, 30_000)).at(-1)

    if (!span) {
      throw new Error("Missing span")
    }

    collected.push({ name, durationMs: span.durationMs, count: span.attributes?.count ?? 0, state: span.attributes?.state ?? "" })
  }
}

const groups = new Map<string, OpenSpan[]>()

for (const span of collected) {
  const key = `${span.name} (${span.count}) ${span.state}`
  groups.set(key, [...(groups.get(key) ?? []), span])
}

console.table([...groups.entries()].map(([key, spans]) => ({ conversa: key, n: spans.length, p50: Math.round(percentile(spans.map((span) => span.durationMs), 0.5)), p95: Math.round(percentile(spans.map((span) => span.durationMs), 0.95)) })))
