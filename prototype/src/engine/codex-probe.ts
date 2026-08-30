import { type } from "arktype"

const rpcResponse = type({
  id: "number.integer",
  "result?": "unknown",
  "error?": "unknown",
})

const rpcNotification = type({
  method: "string",
  "params?": "unknown",
  "emittedAtMs?": "number",
})

const initializeResult = type({
  userAgent: "string",
  codexHome: "string",
  platformFamily: "string",
  platformOs: "string",
})

const account = type("null").or({
  type: "string",
  "email?": "string | null",
  "planType?": "string",
})

const accountResult = type({
  requiresOpenaiAuth: "boolean",
  account,
})

const model = type({ id: "string", displayName: "string", isDefault: "boolean" })

const modelListResult = type({
  data: model.array(),
  "nextCursor?": "string | null",
})

function redactEmail(email: string | null | undefined) {
  if (!email) {
    return null
  }

  return "[redacted]"
}

export async function runCodexProbe() {
  const process = Bun.spawn(["codex", "app-server", "--stdio"], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  })
  const writer = process.stdin
  const reader = process.stdout.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ""

  async function request(id: number, method: string, params: unknown) {
    writer.write(`${JSON.stringify({ id, method, params })}\n`)
    await writer.flush()

    while (true) {
      const newline = buffer.indexOf("\n")

      if (newline >= 0) {
        const line = buffer.slice(0, newline)
        buffer = buffer.slice(newline + 1)
        const parsedJson = JSON.parse(line)
        const parsed = rpcResponse(parsedJson)

        if (parsed instanceof type.errors) {
          const notification = rpcNotification(parsedJson)

          if (!(notification instanceof type.errors)) {
            continue
          }

          throw new Error(`Invalid Codex app-server message: ${parsed.summary}`)
        }

        if (parsed.id !== id) {
          continue
        }

        if (parsed.error !== undefined) {
          throw new Error(`Codex app-server rejected ${method}`)
        }

        return parsed.result
      }

      const chunk = await reader.read()

      if (chunk.done) {
        throw new Error(`Codex app-server closed before ${method}`)
      }

      buffer += chunk.value
    }
  }

  try {
    const initialized = initializeResult(await request(1, "initialize", {
      clientInfo: { name: "harness-prototype", version: "0.0.0" },
      capabilities: {},
    }))

    if (initialized instanceof type.errors) {
      throw new Error(`Invalid Codex initialize result: ${initialized.summary}`)
    }

    writer.write(`${JSON.stringify({ method: "initialized" })}\n`)
    await writer.flush()

    const account = accountResult(await request(2, "account/read", { refreshToken: false }))

    if (account instanceof type.errors) {
      throw new Error(`Invalid Codex account result: ${account.summary}`)
    }

    const models = modelListResult(await request(3, "model/list", {}))

    if (models instanceof type.errors) {
      throw new Error(`Invalid Codex model result: ${models.summary}`)
    }

    const defaultModel = models.data.find((model) => model.isDefault)

    return {
      available: true,
      initialized: true,
      accountType: account.account?.type ?? null,
      accountEmail: redactEmail(account.account?.email),
      modelCount: models.data.length,
      defaultModel: defaultModel?.displayName ?? null,
    }
  } finally {
    writer.end()
    process.kill()
    await process.exited
  }
}
