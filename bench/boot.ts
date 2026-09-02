import { parseArgs } from "node:util"
import { join } from "node:path"
import { observation, type Observation } from "../src/shared/observability/observation"
import { parse } from "../src/shared/parse"

const { values } = parseArgs({ args: Bun.argv.slice(2), options: { "user-data": { type: "string", default: ".jolt-load" }, rounds: { type: "string", default: "5" }, "settle-ms": { type: "string", default: "7000" } } })
const userData = join(process.cwd(), values["user-data"])
const logPath = join(userData, "logs", "observations.jsonl")
const rounds = Number(values.rounds)
const settleMs = Number(values["settle-ms"])

type Span = Extract<Observation, { kind: "span" }>

async function spansAfter(offset: number) {
  const text = await Bun.file(logPath).text()

  return text.slice(offset).split("\n").filter(Boolean).map((line) => parse(observation, JSON.parse(line))).filter((item): item is Span => item.kind === "span")
}

function firstSpan(spans: Span[], name: string) {
  const span = spans.find((item) => item.name === name)

  if (!span) {
    throw new Error(`Missing span ${name}`)
  }

  return span
}

function startedAt(span: Span) {
  return new Date(span.timestamp).getTime()
}

async function bootOnce() {
  const offset = (await Bun.file(logPath).text()).length
  const spawnedAt = Date.now()
  const app = Bun.spawn(["./node_modules/.bin/electron", "."], { env: { ...process.env, JOLT_USER_DATA: userData, JOLT_LOAD_PROVIDER: "true" }, stdout: "ignore", stderr: "ignore" })

  await Bun.sleep(settleMs)
  app.kill("SIGTERM")
  await app.exited
  await Bun.sleep(500)

  const spans = await spansAfter(offset)
  const mainStartup = firstSpan(spans, "main.startup")
  const firstRpc = firstSpan(spans, "renderer.rpc")

  return {
    mainStartFromSpawnMs: startedAt(mainStartup) - spawnedAt,
    mainStartupMs: Math.round(mainStartup.durationMs),
    engineStartupMs: Math.round(firstSpan(spans, "engine.startup").durationMs),
    firstRpcFromSpawnMs: startedAt(firstRpc) - spawnedAt,
  }
}

const results = []

for (let round = 0; round < rounds; round += 1) {
  results.push(await bootOnce())
}

console.table(results)
