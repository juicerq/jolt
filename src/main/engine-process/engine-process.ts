import { browserRequest, browserCancel, type BrowserRequest } from "@src/shared/browser"
import { spawn, type ChildProcess } from "node:child_process"
import { type EngineAccess, type EngineAccessMessage, type EngineReadyMessage, type ForwardedObservation, type ForwardedObservationEvent, engineReadyMessage } from "@src/shared/engine-ipc"
import { parse } from "@src/shared/parse"
import { inheritedEnvironment } from "../child-environment"

interface EngineProcessOptions {
  browser: (request: BrowserRequest, signal: AbortSignal) => Promise<string>
  executable: string
  rendererDirectory?: string
  databasePath: string
  privateBotsDirectory: string
  secretKey(): Promise<string>
  googleClient?: { id: string; secret?: string }
  githubRelayUrl?: string
  appVersion: string
  electronVersion: string
  development: boolean
  loadProvider: boolean
  onUnexpectedExit: (error: Error) => void
}

interface EngineListener {
  token: string
  port: number
}

interface ChildExit {
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
  private listening?: EngineListener

  constructor(private readonly options: EngineProcessOptions) {}

  get port() {
    return this.listening?.port
  }

  get connection() {
    if (!this.listening) {
      throw new Error("Bun Engine is not running")
    }

    return { url: `http://127.0.0.1:${this.listening.port}/rpc`, token: this.listening.token }
  }

  async start(access: EngineAccess & { port: number }) {
    if (this.child) {
      throw new Error("Bun Engine is already running")
    }

    const startedAt = new Date().toISOString()
    const started = performance.now()
    const secretKey = await this.options.secretKey()
    const child = spawn(this.options.executable, [], {
      env: {
        ...inheritedEnvironment(),
        BOT_TEAMS_ENGINE_TOKEN: access.token,
        BOT_TEAMS_ENGINE_PORT: String(access.port),
        ...(access.origin ? { BOT_TEAMS_ALLOWED_ORIGIN: access.origin } : {}),
        ...(this.options.rendererDirectory ? { BOT_TEAMS_RENDERER_DIRECTORY: this.options.rendererDirectory } : {}),
        BOT_TEAMS_DATABASE_PATH: this.options.databasePath,
        BOT_TEAMS_PRIVATE_BOTS_DIRECTORY: this.options.privateBotsDirectory,
        BOT_TEAMS_SECRET_KEY: secretKey,
        ...(this.options.googleClient ? { BOT_TEAMS_GOOGLE_CLIENT_ID: this.options.googleClient.id } : {}),
        ...(this.options.googleClient?.secret ? { BOT_TEAMS_GOOGLE_CLIENT_SECRET: this.options.googleClient.secret } : {}),
        ...(this.options.githubRelayUrl ? { BOT_TEAMS_GITHUB_RELAY_URL: this.options.githubRelayUrl } : {}),
        BOT_TEAMS_APP_VERSION: this.options.appVersion,
        BOT_TEAMS_ELECTRON_VERSION: this.options.electronVersion,
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
          this.listening = undefined
        }

        if (this.ready && !this.stopping) {
          this.options.onUnexpectedExit(new Error(`Bun Engine exited unexpectedly with code ${code} and signal ${signal}`))
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

    const browserActions = new Map<string, AbortController>()

    child.on("message", (raw: unknown) => {
      const cancellation = browserCancel.safeParse(raw)

      if (cancellation.success) {
        browserActions.get(cancellation.data.id)?.abort()
        return
      }

      const request = browserRequest.safeParse(raw)

      if (!request.success) {
        return
      }

      const controller = new AbortController()
      browserActions.set(request.data.id, controller)

      void this.options.browser(request.data, controller.signal).then(
        (result) => ({ type: "browser-reply", id: request.data.id, result, error: false }),
        (error: unknown) => ({ type: "browser-reply", id: request.data.id, result: error instanceof Error ? error.message : "Browser action failed", error: true }),
      ).then((reply) => {
        browserActions.delete(request.data.id)

        if (child.connected) {
          child.send(reply, (error) => {
            if (error) {
              console.error("Browser reply failed", error.message)
            }
          })
        }
      })
    })
    child.once("exit", () => {
      for (const controller of browserActions.values()) {
        controller.abort()
      }
    })
    this.ready = true
    this.listening = { token: access.token, port: ready.port }
    await this.send({
      type: "span",
      span: {
        name: "main.startup",
        timestamp: startedAt,
        durationMs: performance.now() - started,
        outcome: "ok",
        traceId: crypto.randomUUID(),
        spanId: crypto.randomUUID(),
        attributes: { process: "main", status: "ready", version: this.options.appVersion },
      },
    })
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
    return this.send({ type: "observation", ...input })
  }

  grant(access: EngineAccess) {
    if (this.listening) {
      this.listening = { ...this.listening, token: access.token }
    }

    return this.send({ type: "access", ...access })
  }

  private send(message: ForwardedObservation | EngineAccessMessage) {
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
