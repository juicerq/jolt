import { parseArgs } from "node:util"
import { z } from "zod"
import type { Observation } from "../src/shared/observability/observation"
import { connectCdp } from "./cdp"
import { observationLog, observations, waitForObservations } from "./observations"

const { values } = parseArgs({ args: Bun.argv.slice(2), options: { "user-data": { type: "string", default: ".jolt-load" }, port: { type: "string", default: "9222" }, rounds: { type: "string", default: "10" } } })
const logPath = observationLog(values["user-data"])
const rounds = Number(values.rounds)
const route = ["Média", "Pesada", "Enorme", "Coordenador", "Pesquisador", "Leve"]
const heapUsage = z.object({ usedSize: z.number(), totalSize: z.number() })
const domCounters = z.object({ documents: z.number(), nodes: z.number(), jsEventListeners: z.number() })

type Sample = { round: number; heapMb: number; nodes: number; listeners: number; rendererMb: number; gpuMb: number; mainMb: number; engineMb: number }

function isFinishedTurn(item: Observation) {
  return item.kind === "event" && item.name === "conversation.finished"
}

function isOpenSpan(item: Observation) {
  return item.kind === "span" && item.name === "renderer.conversationopen"
}

function processTree() {
  const rows = Bun.spawnSync(["ps", "-eo", "pid=,ppid=,rss=,args="]).stdout.toString().split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
    const [pid = "0", ppid = "0", rss = "0", ...args] = line.split(/\s+/)

    return { pid: Number(pid), ppid: Number(ppid), rssMb: Number(rss) / 1024, args: args.join(" ") }
  })
  const main = rows.find((row) => /electron \.$/.test(row.args) && !rows.some((parent) => parent.pid === row.ppid && /electron \.$/.test(parent.args)))

  if (!main) {
    throw new Error("Electron is not running")
  }

  const family = [main]

  for (const row of rows) {
    if (family.some((member) => member.pid === row.ppid)) {
      family.push(row)
    }
  }

  const total = (matches: (args: string) => boolean) => family.filter((row) => matches(row.args)).reduce((sum, row) => sum + row.rssMb, 0)

  return {
    main: total((args) => /electron \.$/.test(args)),
    renderer: total((args) => args.includes("--type=renderer")),
    gpu: total((args) => args.includes("--type=gpu-process")),
    engine: total((args) => args.endsWith("jolt-engine")),
  }
}

function clickConversation(name: string) {
  return cdp.evaluate(`[...document.querySelectorAll("button")].find((button) => button.textContent.includes("de ${name} com")).click()`, z.undefined())
}

async function openConversations() {
  for (const name of route) {
    const seen = (await observations(logPath)).filter(isOpenSpan).length

    await clickConversation(name)
    await waitForObservations(logPath, isOpenSpan, seen, 30_000)
  }
}

async function sendTurn() {
  const before = (await observations(logPath)).filter(isFinishedTurn).length

  await cdp.evaluate(`(async () => {
    const editor = document.querySelector("[contenteditable=true][role=combobox]")
    editor.focus()
    editor.textContent = "Revise o módulo de cobrança e liste o que precisa mudar."
    editor.dispatchEvent(new InputEvent("input", { bubbles: true }))

    const send = editor.closest("form").querySelector("button[type=submit]")

    for (let attempt = 0; attempt < 50 && send.disabled; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20))
    }

    send.click()
  })()`, z.undefined())
  await waitForObservations(logPath, isFinishedTurn, before, 60_000)
}

function slope(points: number[]) {
  const count = points.length
  const meanX = (count - 1) / 2
  const meanY = points.reduce((total, value) => total + value, 0) / count
  const covariance = points.reduce((total, value, index) => total + (index - meanX) * (value - meanY), 0)
  const variance = points.reduce((total, _value, index) => total + (index - meanX) ** 2, 0)

  return covariance / Math.max(1, variance)
}

function trend(samples: Sample[], key: keyof Omit<Sample, "round">) {
  const points = samples.map((entry) => entry[key])
  const half = points.slice(Math.floor(points.length / 2))

  return { metric: key, first: Math.round(points[0] ?? 0), last: Math.round(points.at(-1) ?? 0), perRoundSecondHalf: Number(slope(half).toFixed(1)) }
}

async function sample(round: number): Promise<Sample> {
  await Bun.sleep(1_000)
  await cdp.call("HeapProfiler.collectGarbage", z.object({}))
  await Bun.sleep(500)

  const heap = await cdp.call("Runtime.getHeapUsage", heapUsage)
  const dom = await cdp.call("Memory.getDOMCounters", domCounters)
  const tree = processTree()

  return { round, heapMb: heap.usedSize / 1048576, nodes: dom.nodes, listeners: dom.jsEventListeners, rendererMb: tree.renderer, gpuMb: tree.gpu, mainMb: tree.main, engineMb: tree.engine }
}

const cdp = await connectCdp(values.port)

await clickConversation("Leve")

const samples: Sample[] = [await sample(0)]

for (let round = 1; round <= rounds; round += 1) {
  await openConversations()
  await sendTurn()
  samples.push(await sample(round))
}

cdp.close()
console.table(samples.map((entry) => ({ ...entry, heapMb: Math.round(entry.heapMb), rendererMb: Math.round(entry.rendererMb), gpuMb: Math.round(entry.gpuMb), mainMb: Math.round(entry.mainMb), engineMb: Math.round(entry.engineMb) })))
console.table((["heapMb", "nodes", "listeners", "rendererMb", "gpuMb", "mainMb", "engineMb"] as const).map((key) => trend(samples, key)))
