export function browser(...args: string[]) {
  const result = Bun.spawnSync(["agent-browser", ...args])

  if (result.exitCode !== 0) {
    throw new Error(`agent-browser ${args.join(" ")} failed: ${result.stderr.toString()}`)
  }

  return result.stdout.toString()
}

export function evaluate<T>(script: string): T {
  const output = browser("eval", "-b", Buffer.from(script).toString("base64"))

  return JSON.parse(JSON.parse(output.trim()))
}

export function percentile(values: number[], ratio: number) {
  const sorted = values.toSorted((left, right) => left - right)

  return sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)] ?? 0
}
