import { AsyncLocalStorage } from "node:async_hooks"
import { appendFile, mkdir, rename, stat, unlink } from "node:fs/promises"
import { join } from "node:path"
import {
  normalizedObservationError,
  observation,
  observationAttributes,
  observationContext,
  type NormalizedObservationError,
  type ExternalObservationSpan,
  type Observation,
  type ObservationAttributes,
  type ObservationContext,
} from "../../shared/observability/observation"
import { parse } from "../../shared/parse"

type EventInput = {
  name: string
  attributes?: Record<string, unknown>
  context?: ObservationContext
  error?: unknown
}

type SpanInput = Omit<EventInput, "error">

export type Observability = {
  event(input: EventInput): void
  span<T>(input: SpanInput, operation: () => T): T
  flush(): Promise<void>
}

export type ObservationDiagnostics = {
  recent(): Observation[]
  logPath(): string
}

export type ObservationReceiver = {
  span(input: ExternalObservationSpan): void
}

type ObservationOutput = {
  write(item: Observation): void | Promise<void>
  flush(): Promise<void>
}

type ObservationSystemOptions = {
  appSessionId: string
  logDirectory: string
  development: boolean
  maxFileBytes?: number
  maxFiles?: number
  recentLimit?: number
  outputs?: ObservationOutput[]
}

const allowedAttributeKeys = new Set([
  "bytes",
  "code",
  "count",
  "method",
  "port",
  "process",
  "runtime",
  "state",
  "status",
  "version",
])

function sanitizeAttributes(input?: Record<string, unknown>) {
  if (!input) {
    return undefined
  }

  try {
    const entries = Object.entries(input).flatMap(([key, value]) => {
      if (!allowedAttributeKeys.has(key)) {
        return []
      }

      const valid = key === "bytes" || key === "count" || key === "port"
        ? typeof value === "number" && Number.isFinite(value)
        : typeof value === "string"

      if (!valid) {
        process.stderr.write(`Invalid observation attribute dropped: ${key}\n`)

        return []
      }

      return [[key, value]]
    })
    const candidate = Object.fromEntries(entries)

    if (Object.keys(candidate).length === 0) {
      return undefined
    }

    return parse(observationAttributes, candidate)
  } catch {
    process.stderr.write("Observation attributes could not be sanitized\n")

    return undefined
  }
}

function safeString(value: unknown) {
  try {
    return String(value)
  } catch {
    return "Unrepresentable error"
  }
}

function normalizeError(error: unknown): NormalizedObservationError {
  try {
    if (error instanceof Error) {
      const code = Reflect.get(error, "code")
      const stack = Reflect.get(error, "stack")
      const candidate = {
        type: redactText(safeString(Reflect.get(error, "name"))),
        message: redactText(safeString(Reflect.get(error, "message"))),
        ...(typeof code === "string" ? { code: redactText(code) } : {}),
        ...(typeof stack === "string" ? { stack: redactText(stack) } : {}),
      }

      return parse(normalizedObservationError, candidate)
    }

    return parse(normalizedObservationError, { type: "UnknownError", message: redactText(safeString(error)) })
  } catch {
    return parse(normalizedObservationError, { type: "UnknownError", message: "Unrepresentable error" })
  }
}

function redactText(value: string) {
  return value
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted-email]")
    .replace(/\bBearer\s+[^\s]+/gi, "Bearer [redacted]")
    .replace(/\b(api[_ -]?key|token|cookie|password)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
}

function createBufferOutput(limit: number) {
  const items: Observation[] = []

  return {
    output: {
      write(item: Observation) {
        items.push(item)

        if (items.length > limit) {
          items.splice(0, items.length - limit)
        }
      },
      async flush() {},
    } satisfies ObservationOutput,
    recent: () => items.map((item) => structuredClone(item)),
  }
}

function createConsoleOutput(): ObservationOutput {
  return {
    write(item) {
      process.stdout.write(`${JSON.stringify(item)}\n`)
    },
    async flush() {},
  }
}

function createJsonlOutput(directory: string, maxFileBytes: number, maxFiles: number): ObservationOutput & { path: string } {
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
  const buffer = createBufferOutput(options.recentLimit ?? 500)
  const jsonl = createJsonlOutput(options.logDirectory, options.maxFileBytes ?? 5_000_000, options.maxFiles ?? 5)
  const outputs = options.outputs ?? [jsonl, buffer.output, ...(options.development ? [createConsoleOutput()] : [])]
  const writes = new Set<Promise<void>>()

  function write(item: Observation) {
    for (const output of outputs) {
      const pending = Promise.resolve()
        .then(() => output.write(item))
        .catch((error) => {
          process.stderr.write(`Observability output failed: ${normalizeError(error).message}\n`)
        })
        .finally(() => writes.delete(pending))
      writes.add(pending)
    }
  }

  function contextFor(input?: ObservationContext) {
    const current = storage.getStore()

    return parse(observationContext, { appSessionId: options.appSessionId, ...current, ...input })
  }

  function event(input: EventInput) {
    const context = contextFor(input.context)
    const attributes = sanitizeAttributes(input.attributes)
    const item = parse(observation, {
      kind: "event",
      name: input.name,
      timestamp: new Date().toISOString(),
      level: Object.hasOwn(input, "error") ? "error" : "info",
      ...context,
      ...(attributes ? { attributes } : {}),
      ...(Object.hasOwn(input, "error") ? { error: normalizeError(input.error) } : {}),
    })
    write(item)
  }

  function span<T>(input: SpanInput, operation: () => T): T {
    const parent = contextFor(input.context)
    const attributes = sanitizeAttributes(input.attributes)
    const spanId = crypto.randomUUID()
    const spanContext = parse(observationContext, {
      ...parent,
      traceId: parent.traceId ?? crypto.randomUUID(),
      spanId,
      ...(parent.spanId ? { parentSpanId: parent.spanId } : {}),
    })
    const startedAt = performance.now()

    const finish = (failed: boolean, error?: unknown) => {
      const item = parse(observation, {
        kind: "span",
        name: input.name,
        timestamp: new Date().toISOString(),
        level: failed ? "error" : "info",
        durationMs: performance.now() - startedAt,
        outcome: failed ? "error" : "ok",
        ...spanContext,
        ...(attributes ? { attributes } : {}),
        ...(failed ? { error: normalizeError(error) } : {}),
      })
      write(item)
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
      await Promise.all([...writes])
      await Promise.all(outputs.map((output) => output.flush().catch((error) => process.stderr.write(`Observability flush failed: ${normalizeError(error).message}\n`))))
    },
  }

  const receiver: ObservationReceiver = {
    span(input) {
      write(parse(observation, {
        kind: "span",
        level: input.outcome === "error" ? "error" : "info",
        appSessionId: options.appSessionId,
        ...input,
      }))
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
