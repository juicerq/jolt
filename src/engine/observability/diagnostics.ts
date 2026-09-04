import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { diagnosticsReport, type ProcessState } from "@src/shared/observability/diagnostics"
import type { Observation } from "@src/shared/observability/observation"
import type { ProviderAvailability } from "@src/shared/providers"
import type { ObservationDiagnostics } from "./observability"
import { parse } from "@src/shared/parse"

interface DiagnosticsOptions {
  source: ObservationDiagnostics
  versions: { app: string; bun: string; electron: string }
  processState(): { engine: ProcessState; main: ProcessState }
  migrationState(): string[]
  exportDirectory: string
  providerState?(): ProviderAvailability[]
}

function percentile(sorted: number[], ratio: number) {
  const index = Math.max(0, Math.ceil(sorted.length * ratio) - 1)

  return sorted[index] ?? 0
}

function operationMetrics(observations: Observation[]) {
  const durations = new Map<string, number[]>()

  for (const item of observations) {
    if (item.kind !== "span") {
      continue
    }

    const values = durations.get(item.name) ?? []
    values.push(item.durationMs)
    durations.set(item.name, values)
  }

  return [...durations.entries()]
    .map(([name, values]) => {
      const sorted = values.toSorted((left, right) => left - right)

      return {
        name,
        count: sorted.length,
        p50Ms: percentile(sorted, 0.5),
        p95Ms: percentile(sorted, 0.95),
        maximumMs: sorted.at(-1) ?? 0,
      }
    })
    .toSorted((left, right) => right.maximumMs - left.maximumMs)
}

export function createDiagnostics(options: DiagnosticsOptions) {
  function authentication() {
    const states = new Map(options.providerState?.().map((provider) => [provider.provider, provider.status]))
    const state = (provider: ProviderAvailability["provider"]) => {
      if (states.get(provider) === "available") {
        return "authenticated" as const
      }

      if (states.get(provider) === "unauthenticated") {
        return "unauthenticated" as const
      }

      return "unknown" as const
    }

    return { codex: state("codex"), opencode: state("opencode") }
  }

  function get() {
    const observations = options.source.recent()
    const slowOperations = observations
      .filter((item): item is Extract<Observation, { kind: "span" }> => item.kind === "span")
      .toSorted((left, right) => right.durationMs - left.durationMs)
      .slice(0, 10)
      .map((item) => ({
        name: item.name,
        durationMs: item.durationMs,
        timestamp: item.timestamp,
        ...(item.traceId ? { traceId: item.traceId } : {}),
      }))

    return parse(diagnosticsReport, {
      generatedAt: new Date().toISOString(),
      logPath: options.source.logPath(),
      processes: options.processState(),
      versions: options.versions,
      authentication: authentication(),
      failures: observations.filter((item) => item.level === "error").slice(-10).toReversed(),
      operations: operationMetrics(observations),
      slowOperations,
    })
  }

  return {
    get,
    async export() {
      const path = join(options.exportDirectory, `diagnostics-${new Date().toISOString().replaceAll(":", "-")}.json`)
      const payload = {
        generatedAt: new Date().toISOString(),
        observations: options.source.recent(),
        versions: options.versions,
        configuration: { localOnly: true },
        migrations: options.migrationState(),
      }
      await mkdir(options.exportDirectory, { recursive: true })
      await writeFile(path, JSON.stringify(payload, null, 2), "utf8")

      return { path }
    },
  }
}
