import { describe, expect, test } from "bun:test"
import { writeFile } from "node:fs/promises"
import { join } from "node:path"
import { createClaudeProvider } from "@src/engine/claude/claude-provider"
import type { Observability } from "@src/engine/observability/observability"
import { testDirectory } from "../../support/test-directory"

const directory = testDirectory("jots-claude-")
const observability: Observability = { event() {}, span: (_input, operation) => operation(), async flush() {} }

async function executable(body: string) {
  const path = join(directory, "claude")
  await writeFile(path, body, { mode: 0o700 })

  return path
}

describe("Claude provider", () => {
  test("validates the official version and authenticated status output", async () => {
    const path = await executable(`#!/bin/sh
if [ "$1" = "--version" ]; then printf '2.1.250 (Claude Code)'; exit 0; fi
printf '{"loggedIn":true,"authMethod":"claude.ai","apiProvider":"firstParty","analyticsDisabled":false,"projectsDirectory":"/secret/path"}'
`)
    const provider = createClaudeProvider(observability, () => path)

    expect(await provider.probe()).toEqual({ provider: "claude", status: "available", version: "2.1.250" })
  })

  test("maps the official exit-one auth response to unauthenticated", async () => {
    const path = await executable(`#!/bin/sh
if [ "$1" = "--version" ]; then printf '2.1.250 (Claude Code)'; exit 0; fi
printf '{"loggedIn":false,"authMethod":"none","apiProvider":"firstParty","analyticsDisabled":false,"projectsDirectory":"/secret/path"}'
exit 1
`)
    const provider = createClaudeProvider(observability, () => path)

    expect(await provider.probe()).toEqual({ provider: "claude", status: "unauthenticated", version: "2.1.250" })
  })

  test("does not treat API key authentication as a subscription", async () => {
    const path = await executable(`#!/bin/sh
if [ "$1" = "--version" ]; then printf '2.1.250 (Claude Code)'; exit 0; fi
printf '{"loggedIn":true,"authMethod":"apiKey","apiProvider":"firstParty","analyticsDisabled":false,"projectsDirectory":"/secret/path"}'
`)
    const provider = createClaudeProvider(observability, () => path)

    expect(await provider.probe()).toEqual({ provider: "claude", status: "incompatible", version: "2.1.250" })
  })

  test("rejects an unrecognized external response", async () => {
    const path = await executable("#!/bin/sh\nprintf 'unexpected'")
    const provider = createClaudeProvider(observability, () => path)

    await expect(provider.probe()).rejects.toThrow("Claude version output is incompatible")
  })
})
