import { type } from "arktype"

const authStatus = type({
  loggedIn: "boolean",
  authMethod: "string",
  apiProvider: "string",
  analyticsDisabled: "boolean",
  projectsDirectory: "string",
})

const sdkMessage = type({ type: "string" })

const sdkResult = type({
  type: "'result'",
  subtype: "string",
  is_error: "boolean",
  total_cost_usd: "number >= 0",
})

export async function runClaudeProbe() {
  const authProcess = Bun.spawn(["claude", "auth", "status", "--json"], {
    stdout: "pipe",
    stderr: "pipe",
  })
  const output = await new Response(authProcess.stdout).text()
  await authProcess.exited
  const status = authStatus(JSON.parse(output))

  if (status instanceof type.errors) {
    throw new Error(`Invalid Claude auth status: ${status.summary}`)
  }

  const sdk = await import("@anthropic-ai/claude-agent-sdk")

  if (status.loggedIn) {
    return {
      available: true,
      loggedIn: true,
      authMethod: status.authMethod,
      sdkLoaded: typeof sdk.query === "function",
      startupAttempted: false,
      startupResult: "Skipped to avoid a paid call while authenticated",
      startupCostUsd: 0,
      startupWasError: false,
    }
  }

  const subprocessEnv = Object.fromEntries(
    [
      ["PATH", process.env.PATH],
      ["HOME", process.env.HOME],
      ["USER", process.env.USER],
      ["SHELL", process.env.SHELL],
      ["CLAUDE_AGENT_SDK_CLIENT_APP", "harness-prototype/0.0.0"],
    ].filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  )

  const session = sdk.query({
    prompt: "Authentication probe. Do not execute tools.",
    options: {
      maxTurns: 1,
      pathToClaudeCodeExecutable: "claude",
      env: subprocessEnv,
    },
  })

  try {
    const observed: string[] = []
    let startupCostUsd = 0
    let startupWasError = false
    const deadline = Date.now() + 5_000

    while (Date.now() < deadline) {
      const message = await Promise.race([
        session.next(),
        Bun.sleep(Math.max(1, deadline - Date.now())).then(() => null),
      ])

      if (!message) {
        break
      }

      if (message.done) {
        observed.push("closed")
        break
      }

      const parsed = sdkMessage(message.value)

      if (parsed instanceof type.errors) {
        throw new Error(`Invalid Claude SDK message: ${parsed.summary}`)
      }

      observed.push(parsed.type)

      if (parsed.type === "result") {
        const result = sdkResult(message.value)

        if (result instanceof type.errors) {
          throw new Error(`Invalid Claude SDK result: ${result.summary}`)
        }

        startupCostUsd = result.total_cost_usd
        startupWasError = result.is_error
        break
      }
    }

    return {
      available: true,
      loggedIn: false,
      authMethod: status.authMethod,
      sdkLoaded: true,
      startupAttempted: true,
      startupResult: observed.length > 0 ? observed.join(" → ") : "timeout",
      startupCostUsd,
      startupWasError,
    }
  } finally {
    session.close()
  }
}
