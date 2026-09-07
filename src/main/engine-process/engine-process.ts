import { browserCancel, browserFrameRequest, browserPagesMessage, browserRequest, type BrowserFrameInput, type BrowserFrameReply, type BrowserFrame, type BrowserPagesMessage, type BrowserPreview, type BrowserReply, type BrowserRequest } from "@src/shared/browser"
import { spawn, type ChildProcess } from "node:child_process"
import { type EngineAccessMessage, type EngineReadyMessage, type ForwardedObservation, type ForwardedObservationEvent, engineAccessMessage, engineConnection, engineReadyMessage, forwardedObservation, forwardedObservationEvent } from "@src/shared/engine-ipc"
import { parse } from "@src/shared/parse"

interface EngineProcessOptions {
  browser: () => { execute(request: BrowserRequest, signal: AbortSignal): Promise<string>; frame(input: BrowserFrameInput): Promise<BrowserFrame | null> } | undefined
  executable: string
  rendererDirectory?: string
  databasePath: string
  privateBotsDirectory: string
  secretKey(): Promise<string>
  googleClient?: { id: string; secret?: string }
  githubRelayUrl?: string
  appVersion?: string
  electronVersion?: string
  development?: boolean
  loadProvider?: boolean
  onUnexpectedExit?: (error: Error) => void
}

type EngineAccess = Omit<EngineAccessMessage, "type">

interface EngineListener {
  token: string
  port: number
}

interface ChildExit {
  code: number | null
  signal: NodeJS.Signals | null
}

const readinessTimeoutMs = 10_000
const inheritedNames = ["PATH", "HOME", "USER", "TMPDIR", "LANG", "SystemRoot", "ComSpec", "PATHEXT", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "ProgramData", "TEMP", "TMP"]

function inheritedEnvironment() {
  return Object.fromEntries(inheritedNames.flatMap((name) => (process.env[name] ? [[name, process.env[name]]] : [])))
}
const shutdownTimeoutMs = 5_000

export class EngineProcess {
  private child?: ChildProcess
  private exit?: Promise<ChildExit>
  private stopping = false
  private ready = false
  private listening?: EngineListener

  constructor(private readonly options: EngineProcessOptions) {}

  get pid() {
    return this.child?.pid
  }

  get port() {
    return this.listening?.port
  }

  get connection() {
    if (!this.listening) {
      throw new Error("Bun Engine is not running")
    }

    return parse(engineConnection, { url: `http://127.0.0.1:${this.listening.port}/rpc`, token: this.listening.token })
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
          this.listening = undefined
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

    const browserActions = new Map<string, AbortController>()

    const reply = (message: BrowserFrameReply | BrowserReply) => {
      if (child.connected) {
        child.send(message, (error) => {
          if (error) {
            console.error("Browser reply failed", error.message)
          }
        })
      }
    }

    child.on("message", (raw: unknown) => {
      const cancellation = browserCancel.safeParse(raw)

      if (cancellation.success) {
        browserActions.get(cancellation.data.id)?.abort()
        return
      }

      const frameRequest = browserFrameRequest.safeParse(raw)

      if (frameRequest.success) {
        const browser = this.options.browser()
        const execution = browser ? browser.frame(frameRequest.data.input) : Promise.reject(new Error("Browser is unavailable"))

        void execution.then(
          (frame): BrowserFrameReply => ({ type: "browser-frame-reply", id: frameRequest.data.id, frame, error: null }),
          (error: unknown): BrowserFrameReply => ({ type: "browser-frame-reply", id: frameRequest.data.id, frame: null, error: error instanceof Error ? error.message : "Browser frame failed" }),
        ).then(reply)
        return
      }

      const request = browserRequest.safeParse(raw)

      if (!request.success) {
        return
      }

      const controller = new AbortController()
      browserActions.set(request.data.id, controller)
      const browser = this.options.browser()
      const execution = browser ? browser.execute(request.data, controller.signal) : Promise.reject(new Error("Browser is unavailable"))

      void execution.then(
        (result): BrowserReply => ({ type: "browser-reply", id: request.data.id, result, error: false }),
        (error: unknown): BrowserReply => ({ type: "browser-reply", id: request.data.id, result: error instanceof Error ? error.message : "Browser action failed", error: true }),
      ).then((message) => {
        browserActions.delete(request.data.id)
        reply(message)
      })
    })
    child.once("exit", () => {
      for (const controller of browserActions.values()) {
        controller.abort()
      }
    })
    this.ready = true
    this.listening = { token: access.token, port: ready.port }
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

    return this.connection
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

  publishBrowserPages(pages: BrowserPreview[]) {
    void this.send(parse(browserPagesMessage, { type: "browser-pages", pages }))
  }

  grant(access: EngineAccess) {
    if (this.listening) {
      this.listening = { ...this.listening, token: access.token }
    }

    return this.send(parse(engineAccessMessage, { type: "access", ...access }))
  }

  private send(message: ForwardedObservation | EngineAccessMessage | BrowserPagesMessage) {
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
