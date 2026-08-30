import { type } from "arktype"
import type { Observability } from "../observability/observability"
import type { ProviderProbe } from "../providers/provider-discovery"
import { readProviderOutput, runProviderCommand, withProviderProcess, type ProviderProcess } from "../providers/provider-subprocess"

const PROBE_TIMEOUT_MS = 3_000
const codexVersion = type("string").narrow((value) => /^codex-cli \d+\.\d+\.\d+$/.test(value))
const rpcResponse = type({
  "+": "delete",
  id: "number.integer",
  "result?": "unknown",
  "error?": "unknown",
})
const rpcNotification = type({
  "+": "delete",
  method: "string",
})
const initializeResult = type({
  "+": "delete",
  userAgent: "string",
  codexHome: "string",
  platformFamily: "string",
  platformOs: "string",
})
const codexAccount = type("null").or({
  "+": "delete",
  type: "string",
})
const accountResult = type({
  "+": "delete",
  requiresOpenaiAuth: "boolean",
  account: codexAccount,
})

function parseVersion(output: string) {
  const value = output.trim()

  try {
    codexVersion.assert(value)
  } catch {
    throw new Error("Codex version output is incompatible")
  }

  return value.slice("codex-cli ".length)
}

function accountStatus(account: typeof codexAccount.infer) {
  if (!account) {
    return "unauthenticated" as const
  }

  if (account.type === "chatgpt") {
    return "available" as const
  }

  return "incompatible" as const
}

function createRpcClient(processHandle: ProviderProcess) {
  const writer = processHandle.stdin
  const reader = processHandle.stdout.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ""
  let bytes = 0

  async function nextMessage() {
    while (true) {
      const newline = buffer.indexOf("\n")

      if (newline >= 0) {
        const line = buffer.slice(0, newline)
        buffer = buffer.slice(newline + 1)

        try {
          return JSON.parse(line)
        } catch {
          throw new Error("Codex app-server returned invalid JSON")
        }
      }

      const chunk = await reader.read()

      if (chunk.done) {
        throw new Error("Codex app-server closed unexpectedly")
      }

      bytes += chunk.value.length

      if (bytes > 65_536) {
        throw new Error("Provider output limit exceeded")
      }

      buffer += chunk.value
    }
  }

  return {
    notify(method: string) {
      writer.write(`${JSON.stringify({ method })}\n`)

      return writer.flush()
    },
    async request(id: number, method: string, params: unknown) {
      writer.write(`${JSON.stringify({ id, method, params })}\n`)
      await writer.flush()

      while (true) {
        const message = await nextMessage()

        try {
          const response = rpcResponse.assert(message)

          if (response.id !== id) {
            continue
          }

          if (response.error !== undefined) {
            throw new Error("Codex app-server rejected a request")
          }

          return response.result
        } catch {
          try {
            rpcNotification.assert(message)
          } catch {
            throw new Error("Codex app-server message is incompatible")
          }
        }
      }
    },
  }
}

async function readAccount(executable: string) {
  return withProviderProcess([executable, "app-server", "--stdio"], PROBE_TIMEOUT_MS, async (processHandle) => {
    const stderr = readProviderOutput(processHandle.stderr)
    const client = createRpcClient(processHandle)
    const initialized = await client.request(1, "initialize", {
      clientInfo: { name: "jots", version: "0.0.0" },
      capabilities: {},
    })

    try {
      initializeResult.assert(initialized)
    } catch {
      throw new Error("Codex initialize output is incompatible")
    }

    await client.notify("initialized")
    const result = await client.request(2, "account/read", { refreshToken: false })

    try {
      return accountResult.assert(result)
    } catch {
      throw new Error("Codex account output is incompatible")
    } finally {
      processHandle.stdin.end()
      await stderr
    }
  })
}

export function createCodexProvider(observability: Observability, findExecutable = () => Bun.which("codex")): ProviderProbe {
  return {
    provider: "codex",
    async probe() {
      const executable = findExecutable()

      if (!executable) {
        return { provider: "codex", status: "missing" }
      }

      const versionResult = await observability.span(
        { name: "provider.version", context: { provider: "codex" }, attributes: { method: "version" } },
        () => runProviderCommand([executable, "--version"], PROBE_TIMEOUT_MS),
      )

      if (versionResult.exitCode !== 0) {
        throw new Error("Codex version probe failed")
      }

      const version = parseVersion(versionResult.stdout)
      observability.event({ name: "provider.versioned", context: { provider: "codex" }, attributes: { version } })
      const account = await observability.span(
        { name: "provider.authentication", context: { provider: "codex" }, attributes: { method: "accountread" } },
        () => readAccount(executable),
      )
      const status = accountStatus(account.account)
      observability.event({ name: "provider.authenticated", context: { provider: "codex" }, attributes: { status } })

      return { provider: "codex", status, version }
    },
  }
}
