import { parseArgs } from "node:util"
import { join } from "node:path"
import type { Observation } from "../src/shared/observability/observation"
import { observationLog, observations } from "./observations"

const { values } = parseArgs({ args: Bun.argv.slice(2), options: { "user-data": { type: "string", default: ".jolt-load" }, rounds: { type: "string", default: "5" }, "settle-ms": { type: "string", default: "7000" }, provider: { type: "string", default: "load" } } })
const userData = join(process.cwd(), values["user-data"])
const logPath = observationLog(values["user-data"])
const rounds = Number(values.rounds)
const settleMs = Number(values["settle-ms"])
const loadProvider = values.provider === "load"

type Span = Extract<Observation, { kind: "span" }>

async function spansAfter(offset: number) {
  return (await observations(logPath, offset)).filter((item): item is Span => item.kind === "span")
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
  const app = Bun.spawn(["./node_modules/.bin/electron", "."], { env: { ...process.env, JOLT_USER_DATA: userData, JOLT_LOAD_PROVIDER: loadProvider ? "true" : "false" }, stdout: "ignore", stderr: "ignore" })

  await Bun.sleep(settleMs)
  app.kill("SIGTERM")
  await app.exited
  await Bun.sleep(500)

  const spans = await spansAfter(offset)
  const mainStartup = firstSpan(spans, "main.startup")
  const firstRpc = firstSpan(spans, "renderer.rpc")
  const sdkLoad = spans.find((item) => item.name === "pi.sdkload")

  return {
    mainStartFromSpawnMs: startedAt(mainStartup) - spawnedAt,
    mainStartupMs: Math.round(mainStartup.durationMs),
    engineStartupMs: Math.round(firstSpan(spans, "engine.startup").durationMs),
    firstRpcFromSpawnMs: startedAt(firstRpc) - spawnedAt,
    sdkLoadFromSpawnMs: sdkLoad ? startedAt(sdkLoad) - spawnedAt : null,
    sdkLoadMs: sdkLoad ? Math.round(sdkLoad.durationMs) : null,
  }
}

const results = []

for (let round = 0; round < rounds; round += 1) {
  results.push(await bootOnce())
}

console.table(results)
