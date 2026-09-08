import { resolve } from "node:path"
import { observation, type Observation } from "../src/shared/observability/observation"
import { parse } from "../src/shared/parse"

type ObservationEvent = Extract<Observation, { kind: "event" }>
type ObservationSpan = Extract<Observation, { kind: "span" }>

export function observationLog(userData: string) {
  return resolve(userData, "logs", "observations.jsonl")
}

export async function observations(logPath: string, offset = 0) {
  const text = await Bun.file(logPath).text()
  const complete = text.slice(offset, text.lastIndexOf("\n") + 1)

  return complete.split("\n").filter(Boolean).map((line) => parse(observation, JSON.parse(line)))
}

export function isFinishedTurn(item: Observation): item is ObservationEvent {
  return item.kind === "event" && item.name === "conversation.finished"
}

export function isOpenSpan(item: Observation): item is ObservationSpan {
  return item.kind === "span" && item.name === "renderer.conversationopen"
}

export async function waitForObservations<Item extends Observation>(logPath: string, matches: (item: Observation) => item is Item, previous: number, timeoutMs: number) {
  const deadline = performance.now() + timeoutMs

  while (performance.now() < deadline) {
    const found = (await observations(logPath)).filter(matches)

    if (found.length > previous) {
      return found
    }

    await Bun.sleep(50)
  }

  throw new Error(`No new observation arrived in ${timeoutMs}ms`)
}

export function percentile(values: number[], ratio: number) {
  const sorted = values.toSorted((left, right) => left - right)

  return sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)] ?? 0
}
