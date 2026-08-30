import { type } from "arktype"
import type { Observability } from "../observability/observability"
import type { ProviderProbe } from "../providers/provider-discovery"
import { runProviderCommand } from "../providers/provider-subprocess"

const PROBE_TIMEOUT_MS = 3_000
const claudeVersion = type("string").narrow((value) => /^\d+\.\d+\.\d+ \(Claude Code\)$/.test(value))
const claudeAuthStatus = type({
  "+": "delete",
  loggedIn: "boolean",
  authMethod: "string",
  apiProvider: "string",
  analyticsDisabled: "boolean",
  projectsDirectory: "string",
})

function parseVersion(output: string) {
  const value = output.trim()

  try {
    claudeVersion.assert(value)
  } catch {
    throw new Error("Claude version output is incompatible")
  }

  return value.slice(0, value.indexOf(" "))
}

function parseAuthStatus(output: string) {
  try {
    return claudeAuthStatus.assert(JSON.parse(output))
  } catch {
    throw new Error("Claude authentication output is incompatible")
  }
}

function authenticationStatus(auth: typeof claudeAuthStatus.infer) {
  if (!auth.loggedIn) {
    return "unauthenticated" as const
  }

  if (auth.authMethod === "claude.ai") {
    return "available" as const
  }

  return "incompatible" as const
}

export function createClaudeProvider(observability: Observability, findExecutable = () => Bun.which("claude")): ProviderProbe {
  return {
    provider: "claude",
    async probe() {
      const executable = findExecutable()

      if (!executable) {
        return { provider: "claude", status: "missing" }
      }

      const versionResult = await observability.span(
        { name: "provider.version", context: { provider: "claude" }, attributes: { method: "version" } },
        () => runProviderCommand([executable, "--version"], PROBE_TIMEOUT_MS),
      )

      if (versionResult.exitCode !== 0) {
        throw new Error("Claude version probe failed")
      }

      const version = parseVersion(versionResult.stdout)
      observability.event({ name: "provider.versioned", context: { provider: "claude" }, attributes: { version } })
      const authResult = await observability.span(
        { name: "provider.authentication", context: { provider: "claude" }, attributes: { method: "authstatus" } },
        () => runProviderCommand([executable, "auth", "status", "--json"], PROBE_TIMEOUT_MS),
      )

      if (authResult.exitCode !== 0 && authResult.exitCode !== 1) {
        throw new Error("Claude authentication probe failed")
      }

      const auth = parseAuthStatus(authResult.stdout)
      const status = authenticationStatus(auth)
      observability.event({ name: "provider.authenticated", context: { provider: "claude" }, attributes: { status } })

      return { provider: "claude", status, version }
    },
  }
}
