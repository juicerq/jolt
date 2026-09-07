import { AsyncLocalStorage } from "node:async_hooks"
import { appendFile, mkdir, rename, stat, unlink } from "node:fs/promises"
import { join } from "node:path"
import type { ExternalObservationSpan, NormalizedObservationError, Observation, ObservationAttributes, ObservationContext } from "@src/shared/observability/observation"

interface EventInput {
  name: string
  attributes?: ObservationAttributes
  context?: ObservationContext
  error?: unknown
}

type SpanInput = Omit<EventInput, "error">

export interface Observability {
  event(input: EventInput): void
  span<T>(input: SpanInput, operation: () => T): T
  flush(): Promise<void>
}

export interface ObservationDiagnostics {
  recent(): Observation[]
  logPath(): string
}

export interface ObservationReceiver {
  span(input: ExternalObservationSpan): void
}

interface ObservationOutput {
  write(item: Observation): Promise<void>
  flush(): Promise<void>
}

interface ObservationSystemOptions {
  appSessionId: string
  logDirectory: string
  development: boolean
}

const recentLimit = 500
const maxFileBytes = 5_000_000
const maxFiles = 5

function safeString(value: unknown) {
  try {
    return String(value)
  } catch {
    return "Unrepresentable error"
  }
}

function normalizeError(error: unknown): NormalizedObservationError {
  if (!(error instanceof Error)) {
    return { type: "UnknownError", message: redactText(safeString(error)) }
  }

  const code = Reflect.get(error, "code")

  return {
    type: redactText(safeString(error.name)),
    message: redactText(safeString(error.message)),
    ...(typeof code === "string" ? { code: redactText(code) } : {}),
    ...(typeof error.stack === "string" ? { stack: redactText(error.stack) } : {}),
  }
}

function redactText(value: string) {
  return value
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted-email]")
    .replace(/\bBearer\s+[^\s]+/gi, "Bearer [redacted]")
    .replace(/\b(api[_ -]?key|token|cookie|password)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
}

function createBufferOutput() {
  const items: Observation[] = []

  return {
    output: {
      async write(item: Observation) {
        items.push(item)

        if (items.length > recentLimit) {
          items.splice(0, items.length - recentLimit)
        }
      },
      async flush() {},
    } satisfies ObservationOutput,
    recent: () => items.map((item) => structuredClone(item)),
  }
}

function createConsoleOutput(): ObservationOutput {
  return {
    async write(item) {
      process.stdout.write(`${JSON.stringify(item)}\n`)
    },
    async flush() {},
  }
}

function createJsonlOutput(directory: string): ObservationOutput & { path: string } {
  const path = join(directory, "observations.jsonl")
  let pending = Promise.resolve()

  async function rotate(nextBytes: number) {
    const size = await stat(path).then((value) => value.size).catch((error) => {
      if (Reflect.get(Object(error), "code") === "ENOENT") {
        return 0
      }

      throw error
    })

    if (size === 0 || size + nextBytes <= maxFileBytes) {
      return
    }

    const ignoreMissing = async (operation: Promise<unknown>) => {
      await operation.catch((error) => {
        if (Reflect.get(Object(error), "code") !== "ENOENT") {
          throw error
        }
      })
    }

    await ignoreMissing(unlink(join(directory, `observations.${maxFiles - 1}.jsonl`)))

    for (let index = maxFiles - 2; index >= 1; index--) {
      await ignoreMissing(rename(join(directory, `observations.${index}.jsonl`), join(directory, `observations.${index + 1}.jsonl`)))
    }

    await ignoreMissing(rename(path, join(directory, "observations.1.jsonl")))
  }

  return {
    path,
    write(item) {
      const line = `${JSON.stringify(item)}\n`
      pending = pending.catch(() => {}).then(async () => {
        await mkdir(directory, { recursive: true })
        await rotate(Buffer.byteLength(line))
        await appendFile(path, line, "utf8")
      })

      return pending
    },
    async flush() {
      await pending
    },
  }
}

export function createObservationSystem(options: ObservationSystemOptions) {
  const storage = new AsyncLocalStorage<ObservationContext>()
  const buffer = createBufferOutput()
  const jsonl = createJsonlOutput(options.logDirectory)
  const outputs: ObservationOutput[] = [jsonl, buffer.output, ...(options.development ? [createConsoleOutput()] : [])]

  function write(item: Observation) {
    for (const output of outputs) {
      output.write(item).catch((error) => {
        process.stderr.write(`Observability output failed: ${normalizeError(error).message}\n`)
      })
    }
  }

  function contextFor(input?: ObservationContext): ObservationContext {
    return { appSessionId: options.appSessionId, ...storage.getStore(), ...input }
  }

  function event(input: EventInput) {
    const failed = Object.hasOwn(input, "error")

    write({
      kind: "event",
      name: input.name,
      timestamp: new Date().toISOString(),
      level: failed ? "error" : "info",
      ...contextFor(input.context),
      ...(input.attributes ? { attributes: input.attributes } : {}),
      ...(failed ? { error: normalizeError(input.error) } : {}),
    })
  }

  function span<T>(input: SpanInput, operation: () => T): T {
    const parent = contextFor(input.context)
    const spanContext: ObservationContext = {
      ...parent,
      traceId: parent.traceId ?? crypto.randomUUID(),
      spanId: crypto.randomUUID(),
      ...(parent.spanId ? { parentSpanId: parent.spanId } : {}),
    }
    const startedAt = performance.now()

    const finish = (failed: boolean, error?: unknown) => {
      write({
        kind: "span",
        name: input.name,
        timestamp: new Date().toISOString(),
        level: failed ? "error" : "info",
        durationMs: performance.now() - startedAt,
        outcome: failed ? "error" : "ok",
        ...spanContext,
        ...(input.attributes ? { attributes: input.attributes } : {}),
        ...(failed ? { error: normalizeError(error) } : {}),
      })
    }

    return storage.run(spanContext, () => {
      try {
        const result = operation()

        if (result instanceof Promise) {
          return result.then(
            (value) => {
              finish(false)

              return value
            },
            (error) => {
              finish(true, error)

              throw error
            },
          ) as T
        }

        finish(false)

        return result
      } catch (error) {
        finish(true, error)

        throw error
      }
    })
  }

  const observability: Observability = {
    event,
    span,
    async flush() {
      await Promise.all(outputs.map((output) => output.flush().catch((error) => {
        process.stderr.write(`Observability flush failed: ${normalizeError(error).message}\n`)
      })))
    },
  }

  const receiver: ObservationReceiver = {
    span(input) {
      write({
        kind: "span",
        level: input.outcome === "error" ? "error" : "info",
        appSessionId: options.appSessionId,
        ...input,
      })
    },
  }

  return {
    observability,
    receiver,
    diagnostics: {
      recent: buffer.recent,
      logPath: () => jsonl.path,
    } satisfies ObservationDiagnostics,
  }
}
