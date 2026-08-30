import { describe, expect, test } from "bun:test"
import { writeFile } from "node:fs/promises"
import { join } from "node:path"
import { createCodexProvider } from "@src/engine/codex/codex-provider"
import type { Observability } from "@src/engine/observability/observability"
import { testDirectory } from "../../support/test-directory"

const directory = testDirectory("jots-codex-")
const observability: Observability = { event() {}, span: (_input, operation) => operation(), async flush() {} }

async function executable(account: string) {
  const path = join(directory, "codex")
  await writeFile(path, `#!/usr/bin/env bun
if (Bun.argv.includes("--version")) { process.stdout.write("codex-cli 0.151.0"); process.exit(0) }
for await (const line of console) {
  const message = JSON.parse(line)
  if (message.method === "initialize") process.stdout.write(JSON.stringify({ id: message.id, result: { userAgent: "codex_cli_rs/0.151.0", codexHome: "/secret", platformFamily: "unix", platformOs: "linux" } }) + "\\n")
  if (message.method === "account/read") process.stdout.write(JSON.stringify({ id: message.id, result: { requiresOpenaiAuth: true, account: ${account} } }) + "\\n")
}
`, { mode: 0o700 })

  return path
}

describe("Codex provider", () => {
  test("uses app-server account read without exposing account data", async () => {
    const path = await executable('{"type":"chatgpt","email":"user@example.com","planType":"pro"}')
    const provider = createCodexProvider(observability, () => path)

    expect(await provider.probe()).toEqual({ provider: "codex", status: "available", version: "0.151.0" })
  })

  test("maps an absent app-server account to unauthenticated", async () => {
    const path = await executable("null")
    const provider = createCodexProvider(observability, () => path)

    expect(await provider.probe()).toEqual({ provider: "codex", status: "unauthenticated", version: "0.151.0" })
  })

  test("does not treat API key authentication as a subscription", async () => {
    const path = await executable('{"type":"apiKey"}')
    const provider = createCodexProvider(observability, () => path)

    expect(await provider.probe()).toEqual({ provider: "codex", status: "incompatible", version: "0.151.0" })
  })
})
