import { parseArgs } from "node:util"
import { join } from "node:path"
import { observation } from "../src/shared/observability/observation"

const { values } = parseArgs({ args: Bun.argv.slice(2), options: { "user-data": { type: "string", default: ".jolt-load" }, rounds: { type: "string", default: "3" }, port: { type: "string", default: "9222" } } })
const logPath = join(process.cwd(), values["user-data"], "logs", "observations.jsonl")
const route = ["Leve", "Média", "Pesada", "Enorme", "Coordenador", "Pesquisador", "Leve", "Enorme", "Pesada", "Média"]
const rounds = Number(values.rounds)

type OpenSpan = { name: string; durationMs: number; count: number; state: string }

async function browser(...args: string[]) {
  const result = Bun.spawnSync(["agent-browser", ...args])

  if (result.exitCode !== 0) {
    throw new Error(`agent-browser ${args.join(" ")} failed: ${result.stderr.toString()}`)
  }
}

async function openSpans() {
  const text = await Bun.file(logPath).text()

  return text.split("\n").filter(Boolean).map((line) => observation.assert(JSON.parse(line))).filter((item) => item.kind === "span" && item.name === "renderer.conversationopen")
}

async function waitForSpan(previous: number) {
  const deadline = performance.now() + 30_000

  while (performance.now() < deadline) {
    const spans = await openSpans()

    if (spans.length > previous) {
      return spans
    }

    await Bun.sleep(50)
  }

  throw new Error("No conversation open span arrived in 30s")
}

function percentile(values: number[], ratio: number) {
  const sorted = values.toSorted((left, right) => left - right)

  return sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)] ?? 0
}

await browser("connect", values.port)

const initial = (await openSpans()).length
await browser("find", "role", "button", "click", "--name", "de Pesquisador com")

const collected: OpenSpan[] = []
const before = (await waitForSpan(initial)).length

for (let round = 0; round < rounds; round += 1) {
  for (const name of route) {
    const seen = before + collected.length
    await browser("find", "role", "button", "click", "--name", `de ${name} com`)
    const spans = await waitForSpan(seen)
    const span = spans.at(-1)

    if (!span || span.kind !== "span") {
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
