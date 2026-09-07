import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { z } from "zod"
import { parse } from "../shared/parse"

interface ServeFailure {
  message: string
  enableUrl: string | null
}

const run = promisify(execFile)
const commandTimeoutMs = 15_000
const certificateTimeoutMs = 60_000
const status = z.object({ BackendState: z.string(), Self: z.object({ DNSName: z.string() }).optional() })
const serveStatus = z.object({ Web: z.record(z.string(), z.object({ Handlers: z.record(z.string(), z.object({ Proxy: z.string().optional() })) })).optional() })

async function tailscale<Schema extends z.ZodType>(schema: Schema, ...args: string[]) {
  const { stdout } = await run("tailscale", args)

  return parse(schema, JSON.parse(stdout))
}

async function hostname() {
  const state = await tailscale(status, "status", "--json").catch(() => {})

  if (state?.BackendState !== "Running" || !state.Self) {
    return null
  }

  return state.Self.DNSName.replace(/\.$/, "")
}

async function servePort() {
  const state = await tailscale(serveStatus, "serve", "status", "--json").catch(() => {})
  const proxy = Object.values(state?.Web ?? {}).map((site) => site.Handlers["/"]?.Proxy).find(Boolean)
  const port = proxy ? Number(new URL(proxy).port) : 0

  return port || null
}

function describe(error: unknown): ServeFailure {
  if (error instanceof Error && "code" in error && error.code === "ENOENT") {
    return { message: "O comando tailscale não foi encontrado. Instale o Tailscale neste notebook.", enableUrl: null }
  }

  const output = error instanceof Error ? [String(Reflect.get(error, "stderr") ?? ""), String(Reflect.get(error, "stdout") ?? ""), error.message].join("\n") : String(error)
  const message = output.split("\n").map((line) => line.trim()).find(Boolean) ?? "Falha ao configurar o Tailscale."

  return { message, enableUrl: output.match(/https:\/\/login\.tailscale\.com\/\S+/)?.[0] ?? null }
}

export async function readTailscale() {
  const [name, port] = await Promise.all([hostname(), servePort()])

  return { hostname: name, servePort: port }
}

export async function serve(port: number): Promise<ServeFailure | null> {
  try {
    await run("tailscale", ["serve", "--bg", "--https=443", `http://127.0.0.1:${port}`], { timeout: commandTimeoutMs })

    return null
  } catch (error) {
    return describe(error)
  }
}

export function unserve() {
  return run("tailscale", ["serve", "--https=443", "off"], { timeout: commandTimeoutMs }).then(() => {}, () => {})
}

export function issueCertificate(hostname: string) {
  return fetch(`https://${hostname}/`, { method: "HEAD", signal: AbortSignal.timeout(certificateTimeoutMs) }).then(() => {}, () => {})
}
