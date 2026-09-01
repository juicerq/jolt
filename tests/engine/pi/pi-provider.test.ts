import { describe, expect, test } from "bun:test"
import { createPiProvider } from "@src/engine/pi/pi-provider"
import { createObservationSystem } from "@src/engine/observability/observability"
import { join } from "node:path"
import { testDirectory } from "../../support/test-directory"

const directory = testDirectory("jolt-pi-provider-")

describe("Pi provider", () => {
  test("reports the configured Codex model from the Pi session", async () => {
    const observationSystem = createObservationSystem({ appSessionId: crypto.randomUUID(), logDirectory: join(directory, crypto.randomUUID()), development: false })
    const providers = createPiProvider(observationSystem.observability, async () => [{ id: "gpt-5.6-luna", name: "GPT-5.6 Luna" }], "gpt-5.6-luna")

    expect(await providers.list()).toEqual([{ provider: "codex", status: "available" }])
    expect(providers.current()).toEqual([{ provider: "codex", status: "available" }])
    expect(await providers.models()).toEqual([{ provider: "codex", default: "gpt-5.6-luna", models: [{ id: "gpt-5.6-luna", name: "GPT-5.6 Luna" }] }])
    await observationSystem.observability.flush()
  })

  test("reports an unauthenticated Pi session when its model is unavailable", async () => {
    const observationSystem = createObservationSystem({ appSessionId: crypto.randomUUID(), logDirectory: join(directory, crypto.randomUUID()), development: false })
    const providers = createPiProvider(observationSystem.observability, async () => [], "gpt-5.6-luna")

    expect(await providers.list()).toEqual([{ provider: "codex", status: "unauthenticated" }])
    await observationSystem.observability.flush()
  })

  test("maps a failed Pi model lookup to an incompatible session", async () => {
    const observationSystem = createObservationSystem({ appSessionId: crypto.randomUUID(), logDirectory: join(directory, crypto.randomUUID()), development: false })
    const providers = createPiProvider(observationSystem.observability, async () => { throw new Error("secret") }, "gpt-5.6-luna")

    expect(await providers.list()).toEqual([{ provider: "codex", status: "incompatible" }])
    await observationSystem.observability.flush()
  })
})
