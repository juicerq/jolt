import { randomBytes } from "node:crypto"
import { spawn, type ChildProcess } from "node:child_process"
import { type EngineReadyMessage, type ForwardedObservation, type ForwardedObservationEvent, engineConnection, engineReadyMessage, forwardedObservation, forwardedObservationEvent } from "../../shared/engine-ipc"
import { parse } from "../../shared/parse"

type EngineProcessOptions = {
  executable: string
  databasePath: string
  privateBotsDirectory: string
  appVersion?: string
  electronVersion?: string
  development?: boolean
  loadProvider?: boolean
  onUnexpectedExit?: (error: Error) => void
}

type ChildExit = {
  code: number | null
  signal: NodeJS.Signals | null
}

const readinessTimeoutMs = 10_000
const shutdownTimeoutMs = 5_000

export class EngineProcess {
  private child?: ChildProcess
  private exit?: Promise<ChildExit>
  private stopping = false
  private ready = false

  constructor(private readonly options: EngineProcessOptions) {}

  get pid() {
    return this.child?.pid
  }

  async start() {
    if (this.child) {
      throw new Error("Bun Engine is already running")
    }

    const startedAt = new Date().toISOString()
    const started = performance.now()
    const token = randomBytes(32).toString("hex")
    const child = spawn(this.options.executable, [], {
      env: {
        BOT_TEAMS_ENGINE_TOKEN: token,
        BOT_TEAMS_DATABASE_PATH: this.options.databasePath,
        BOT_TEAMS_PRIVATE_BOTS_DIRECTORY: this.options.privateBotsDirectory,
        BOT_TEAMS_APP_VERSION: this.options.appVersion ?? "0.0.0",
        BOT_TEAMS_ELECTRON_VERSION: this.options.electronVersion ?? "unknown",
        BOT_TEAMS_DEVELOPMENT: this.options.development ? "true" : "false",
        BOT_TEAMS_LOAD_PROVIDER: this.options.loadProvider ? "true" : "false",
      },
      stdio: ["ignore", "inherit", "inherit", "ipc"],
    })
    const exit = new Promise<ChildExit>((resolve) => {
      child.once("close", (code, signal) => {
        resolve({ code, signal })

        if (this.child === child) {
          this.child = undefined
          this.exit = undefined
        }

        if (this.ready && !this.stopping) {
          this.options.onUnexpectedExit?.(new Error(`Bun Engine exited unexpectedly with code ${code} and signal ${signal}`))
        }
      })
    })
    this.child = child
    this.exit = exit
    this.stopping = false
    this.ready = false

    const ready = await new Promise<EngineReadyMessage>((resolve, reject) => {
      let settled = false
      const finish = (result: { ready: EngineReadyMessage } | { error: unknown }) => {
        if (settled) {
          return
        }

        settled = true
        clearTimeout(timeout)
        child.off("error", onError)
        child.off("exit", onExit)
        child.off("message", onMessage)

        if ("error" in result) {
          reject(result.error)
          return
        }

        resolve(result.ready)
      }
      const onError = (error: Error) => finish({ error })
      const onExit = (code: number | null) => finish({ error: new Error(`Bun Engine exited before readiness with code ${code}`) })
      const onMessage = (message: unknown) => {
        try {
          finish({ ready: parse(engineReadyMessage, message) })
        } catch (error) {
          finish({ error })
        }
      }
      const timeout = setTimeout(() => finish({ error: new Error("Bun Engine did not become ready") }), readinessTimeoutMs)

      child.once("error", onError)
      child.once("exit", onExit)
      child.on("message", onMessage)
    }).catch(async (error) => {
      await this.terminate(child, exit)

      throw error
    })

    this.ready = true
    await this.send(parse(forwardedObservation, {
      type: "span",
      span: {
        name: "main.startup",
        timestamp: startedAt,
        durationMs: performance.now() - started,
        outcome: "ok",
        traceId: crypto.randomUUID(),
        spanId: crypto.randomUUID(),
        attributes: { process: "main", status: "ready", version: this.options.appVersion ?? "0.0.0" },
      },
    }))

    return parse(engineConnection, { url: `http://127.0.0.1:${ready.port}/rpc`, token })
  }

  async stop() {
    const child = this.child
    const exit = this.exit

    if (!child || !exit) {
      return
    }

    this.stopping = true
    await this.terminate(child, exit)
    this.ready = false
  }

  event(input: Omit<ForwardedObservationEvent, "type">) {
    return this.send(parse(forwardedObservationEvent, { type: "observation", ...input }))
  }

  private send(message: ForwardedObservation) {
    const child = this.child

    if (!child?.connected) {
      return Promise.resolve()
    }

    return new Promise<void>((resolve) => {
      child.send(message, (error) => {
        if (error) {
          process.stderr.write(`Main observation forwarding failed: ${error.message}\n`)
        }

        resolve()
      })
    })
  }

  private async terminate(child: ChildProcess, exit: Promise<ChildExit>) {
    child.kill("SIGTERM")
    let timer: ReturnType<typeof setTimeout> | undefined
    const timedOut = await Promise.race([
      exit.then(() => false),
      new Promise<true>((resolve) => {
        timer = setTimeout(() => resolve(true), shutdownTimeoutMs)
      }),
    ])

    if (timer) {
      clearTimeout(timer)
    }

    if (timedOut) {
      child.kill("SIGKILL")
      await exit
    }
  }
}
