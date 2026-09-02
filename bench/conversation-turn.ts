import { parseArgs } from "node:util"
import { join } from "node:path"
import { observation } from "../src/shared/observability/observation"
import { parse } from "../src/shared/parse"

const { values } = parseArgs({ args: Bun.argv.slice(2), options: { "user-data": { type: "string", default: ".jolt-load" }, port: { type: "string", default: "9222" }, profile: { type: "string", default: "/tmp/jolt-turn.cpuprofile" } } })
const logPath = join(process.cwd(), values["user-data"], "logs", "observations.jsonl")

function browser(...args: string[]) {
  const result = Bun.spawnSync(["agent-browser", ...args])

  if (result.exitCode !== 0) {
    throw new Error(`agent-browser ${args.join(" ")} failed: ${result.stderr.toString()}`)
  }

  return result.stdout.toString()
}

async function finishedTurns() {
  const text = await Bun.file(logPath).text()

  return text.split("\n").filter(Boolean).map((line) => parse(observation, JSON.parse(line))).filter((item) => item.kind === "event" && item.name === "conversation.finished")
}

async function waitForTurn(previous: number) {
  const deadline = performance.now() + 60_000

  while (performance.now() < deadline) {
    const turns = await finishedTurns()

    if (turns.length > previous) {
      return turns.at(-1)
    }

    await Bun.sleep(100)
  }

  throw new Error("No turn finished in 60s")
}

type ProfileNode = { id: number; callFrame: { functionName: string } }
type TraceEvent = { name?: string; pid?: number; args?: { data?: { cpuProfile?: { nodes?: ProfileNode[]; samples?: number[] }; timeDeltas?: number[] } } }

function summarize(trace: { traceEvents: TraceEvent[] }) {
  const chunks = trace.traceEvents.filter((event) => event.name === "ProfileChunk")
  const perProcess = new Map<number, number>()

  for (const chunk of chunks) {
    perProcess.set(chunk.pid ?? 0, (perProcess.get(chunk.pid ?? 0) ?? 0) + (chunk.args?.data?.timeDeltas?.length ?? 0))
  }

  const pid = [...perProcess.entries()].toSorted((left, right) => right[1] - left[1])[0]?.[0]
  const nodes = new Map<number, ProfileNode>()
  let busyUs = 0
  let wallUs = 0

  for (const chunk of chunks.filter((entry) => entry.pid === pid)) {
    for (const node of chunk.args?.data?.cpuProfile?.nodes ?? []) {
      nodes.set(node.id, node)
    }

    const samples = chunk.args?.data?.cpuProfile?.samples ?? []
    const deltas = chunk.args?.data?.timeDeltas ?? []

    samples.forEach((sample, index) => {
      const delta = deltas[index] ?? 0
      const name = nodes.get(sample)?.callFrame.functionName
      wallUs += delta

      if (name !== "(idle)" && name !== "(program)" && name !== "(garbage collector)") {
        busyUs += delta
      }
    })
  }

  return { wallMs: Math.round(wallUs / 1000), busyMs: Math.round(busyUs / 1000), busyShare: `${Math.round((busyUs / Math.max(1, wallUs)) * 100)}%` }
}

browser("connect", values.port)
browser("find", "role", "button", "click", "--name", "de Leve com")
await Bun.sleep(1_000)

const before = (await finishedTurns()).length
browser("profiler", "start")
browser("find", "role", "combobox", "fill", "Revise o módulo de cobrança e liste o que precisa mudar.")
browser("press", "Enter")

const turn = await waitForTurn(before)
await Bun.sleep(500)
browser("profiler", "stop", values.profile)

const trace = await Bun.file(values.profile).json()

console.table([{ events: turn?.attributes?.count ?? 0, bytes: turn?.attributes?.bytes ?? 0, ...summarize(trace) }])
