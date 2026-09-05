import { execFile } from "node:child_process"
import { writeFile } from "node:fs/promises"
import { join } from "node:path"
import { promisify } from "node:util"
import { app, type WebContents } from "electron"
import { z } from "zod"
import type { BrowserAction } from "@src/shared/browser"
import { parse } from "@src/shared/parse"

const runFile = promisify(execFile)
const response = z.discriminatedUnion("success", [
  z.object({ success: z.literal(true), data: z.unknown() }),
  z.object({ success: z.literal(false), error: z.string() }),
])

export class BrowserDriver {
  private readonly session = `jolt-${process.pid}-${crypto.randomUUID()}`
  private connected = false
  private address?: string
  private active: Promise<unknown> = Promise.resolve()
  private readonly config = join(app.getPath("userData"), "browser-driver.json")
  private readonly executable = join(app.isPackaged ? process.resourcesPath : app.getAppPath(), app.isPackaged ? "browser-driver" : "node_modules/agent-browser/bin", `agent-browser-${process.platform}-${process.arch}${process.platform === "win32" ? ".exe" : ""}`)

  constructor(private readonly contents: WebContents) {}

  private async run(args: string[], signal?: AbortSignal) {
    const running = runFile(this.executable, ["--session", this.session, "--config", this.config, "--json", ...(this.address ? ["--cdp", this.address] : []), ...(this.connected ? ["--pin-tab"] : []), ...args], {
      timeout: 35_000,
      maxBuffer: 1_000_000,
      ...(signal ? { signal } : {}),
      env: { PATH: process.env.PATH, HOME: app.getPath("home"), SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, AGENT_BROWSER_DEFAULT_TIMEOUT: "20000", AGENT_BROWSER_MAX_OUTPUT: "30000", AGENT_BROWSER_CONTENT_BOUNDARIES: "1", AGENT_BROWSER_IDLE_TIMEOUT_MS: "300000" },
    })
    this.active = running.catch(() => {})
    const result = await running.catch((error: NodeJS.ErrnoException) => {
      throw new Error(`The browser command failed (${error.code ?? error.name}). Take a fresh snapshot before deciding whether to retry.`)
    })
    const parsed = parse(response, JSON.parse(result.stdout))

    if (!parsed.success) {
      throw new Error(parsed.error)
    }

    return parsed.data
  }

  private async connect(signal: AbortSignal) {
    if (this.connected) {
      return
    }

    await writeFile(this.config, "{}", { mode: 0o600 })
    this.address = app.commandLine.getSwitchValue("remote-debugging-port")
    this.contents.debugger.attach("1.3")
    const target = await this.contents.debugger.sendCommand("Target.getTargetInfo").finally(() => this.contents.debugger.detach())
    const { targetInfo } = parse(z.object({ targetInfo: z.object({ targetId: z.string() }) }), target)

    await this.run(["tab", targetInfo.targetId], signal)
    await this.run(["--pin-tab", "snapshot", "-c"], signal)
    this.connected = true
  }

  async execute(input: BrowserAction, signal: AbortSignal, ready: () => Promise<void>) {
    await this.connect(signal)
    await ready()

    if (input.action === "navigate") {
      await this.run(["open", input.url], signal)
    } else if (input.action === "click") {
      await this.run(["click", input.target], signal)
    } else if (input.action === "fill") {
      await this.run(["fill", input.target, input.text], signal)
    } else if (input.action === "press") {
      await this.run(["press", input.key], signal)
    } else if (input.action === "scroll") {
      await this.run(["scroll", input.direction, "600"], signal)
    }

    await ready()
    const snapshot = await this.run(["snapshot", "-c"], signal)

    const page = parse(z.object({ snapshot: z.string() }), snapshot)
    await ready()
    const body = parse(z.object({ text: z.string() }), await this.run(["get", "text", "body"], signal))

    return JSON.stringify({ url: this.contents.getURL(), text: body.text.slice(0, 24_000), snapshot: page.snapshot.slice(0, 30_000) })
  }

  async settle() {
    await this.active
  }

  async close() {
    await this.settle()

    if (this.connected) {
      await this.run(["close"]).catch((error: Error) => console.error("Browser driver shutdown failed", error.message))
    }
  }
}
