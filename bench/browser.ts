import { resolve } from "node:path"
import { z } from "zod"
import { parse } from "@src/shared/parse"

export function browser(...args: string[]) {
  const result = Bun.spawnSync([resolve(import.meta.dir, "../node_modules/.bin/agent-browser"), "--session", "jolt-bench", ...args])

  if (result.exitCode !== 0) {
    throw new Error(`agent-browser ${args.join(" ")} failed: ${result.stderr.toString()}`)
  }

  return result.stdout.toString()
}

export function connectBrowser(port: string) {
  browser("connect", port)
  const result = parse(z.object({ data: z.object({ tabs: z.array(z.object({ title: z.string(), tabId: z.string() })) }) }), JSON.parse(browser("tab", "list", "--json")))
  const tab = result.data.tabs.find((tab) => tab.title === "Jolt")

  if (!tab) {
    throw new Error("No Jolt renderer on the CDP port")
  }

  browser("tab", tab.tabId)
}

export function evaluate<T>(script: string): T {
  const output = browser("eval", "-b", Buffer.from(script).toString("base64"))

  return JSON.parse(JSON.parse(output.trim()))
}

export function percentile(values: number[], ratio: number) {
  const sorted = values.toSorted((left, right) => left - right)

  return sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)] ?? 0
}
