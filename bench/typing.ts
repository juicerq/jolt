import { parseArgs } from "node:util"
import type { Observation } from "../src/shared/observability/observation"
import { browser, connectBrowser } from "./browser"
import { observationLog, observations, waitForObservations } from "./observations"
import { type Probe, startProbe, stopProbe, summarizeFrames, summarizeKeys } from "./page-probe"

const { values } = parseArgs({ args: Bun.argv.slice(2), options: { "user-data": { type: "string", default: ".jolt-load" }, port: { type: "string", default: "9222" }, rounds: { type: "string", default: "3" } } })
const logPath = observationLog(values["user-data"])
const rounds = Number(values.rounds)
const text = "Preciso revisar o modulo de cobranca antes da reuniao e listar o que muda em cada arquivo."
const streamingBot = "Leve"
const typingBot = "Média"

interface Sample { typed: number; elapsedMs: number; probe: Probe }

function isFinishedTurn(item: Observation) {
  return item.kind === "event" && item.name === "conversation.finished"
}

async function logSize() {
  return (await Bun.file(logPath).text()).length
}

async function turnFinishedAfter(offset: number) {
  const finished = (await observations(logPath, offset)).some(isFinishedTurn)

  return finished
}

function focusComposer(name: string) {
  browser("find", "role", "button", "click", "--name", `de ${name} com`)
  Bun.sleepSync(500)
  browser("find", "role", "combobox", "click")
}

function clearComposer() {
  browser("press", "Control+a")
  browser("press", "Backspace")
}

async function typeWhile(keepGoing: () => Promise<boolean>): Promise<Sample> {
  startProbe()

  const startedAt = performance.now()
  let typed = 0

  for (const character of text) {
    const goOn = await keepGoing()

    if (!goOn) {
      break
    }

    browser("press", character === " " ? "Space" : character)
    typed += 1
  }

  const elapsedMs = performance.now() - startedAt

  Bun.sleepSync(200)

  return { typed, elapsedMs, probe: stopProbe() }
}

async function typeIdle() {
  focusComposer(typingBot)

  const sample = await typeWhile(async () => true)

  clearComposer()

  return sample
}

async function typeDuringTurn() {
  focusComposer(streamingBot)

  const offset = await logSize()
  const before = (await observations(logPath)).filter(isFinishedTurn).length

  browser("find", "role", "combobox", "fill", "Revise o módulo de cobrança e liste o que precisa mudar.")
  browser("press", "Enter")
  focusComposer(typingBot)

  const sample = await typeWhile(async () => !(await turnFinishedAfter(offset)))

  await waitForObservations(logPath, isFinishedTurn, before, 60_000)
  clearComposer()

  return sample
}

function summarize(label: string, samples: Sample[]) {
  const typed = samples.reduce((total, sample) => total + sample.typed, 0)
  const elapsedMs = samples.reduce((total, sample) => total + sample.elapsedMs, 0)
  const keys = samples.flatMap((sample) => sample.probe.keys)
  const frames = samples.flatMap((sample) => sample.probe.frames)
  const longFrames = samples.flatMap((sample) => sample.probe.longFrames)

  return { label, rounds: samples.length, typed, msPerKey: Math.round(elapsedMs / Math.max(1, typed)), ...summarizeKeys(keys), ...summarizeFrames({ frames, longFrames }) }
}

connectBrowser(values.port)

const idle: Sample[] = []
const streaming: Sample[] = []

for (let round = 0; round < rounds; round += 1) {
  idle.push(await typeIdle())
  streaming.push(await typeDuringTurn())
}

console.table([summarize("digitando sem streaming", idle), summarize("digitando durante o streaming", streaming)])
