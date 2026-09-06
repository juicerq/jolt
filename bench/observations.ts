import { resolve } from "node:path"
import { observation, type Observation } from "../src/shared/observability/observation"
import { parse } from "../src/shared/parse"

export function observationLog(userData: string) {
  return resolve(userData, "logs", "observations.jsonl")
}

export async function observations(logPath: string, offset = 0) {
  const text = await Bun.file(logPath).text()
  const complete = text.slice(offset, text.lastIndexOf("\n") + 1)

  return complete.split("\n").filter(Boolean).map((line) => parse(observation, JSON.parse(line)))
}

export async function waitForObservations(logPath: string, matches: (item: Observation) => boolean, previous: number, timeoutMs: number) {
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
