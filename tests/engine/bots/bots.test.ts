import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import { createBots } from "@src/engine/bots/bots"
import { createObservationSystem } from "@src/engine/observability/observability"
import { openDatabase } from "@src/engine/persistence/database"
import type { ProviderAvailability } from "@src/shared/providers"
import { testDirectory } from "../../support/test-directory"

const directory = testDirectory("jots-bots-")
const input = {
  name: "Marina",
  provider: "codex" as const,
  function: {
    outcome: "Contratos prontos",
    responsibilities: "Preparar propostas",
    limits: "Não altera preços",
    delivery: "Proposta para revisão",
  },
}

function setup(databasePath = join(directory, `${crypto.randomUUID()}.sqlite`), providerList: ProviderAvailability[] = [{ provider: "codex", status: "available" }]) {
  const observationSystem = createObservationSystem({ appSessionId: crypto.randomUUID(), logDirectory: join(directory, crypto.randomUUID()), development: false })
  const database = openDatabase(databasePath, observationSystem.observability)
  const bots = createBots({ database, observability: observationSystem.observability, providers: { list: async () => providerList } })

  return { bots, database, observationSystem }
}

describe("bots", () => {
  test("creates, lists, and gets a persistent standalone bot", async () => {
    const databasePath = join(directory, `${crypto.randomUUID()}.sqlite`)
    const first = setup(databasePath)
    const created = await first.bots.create(input)

    expect(created).toEqual({ id: expect.any(String), leaderBotId: null, ...input, createdAt: expect.any(String) })
    expect(first.bots.list()).toEqual([created])
    expect(first.bots.get({ id: created.id })).toEqual(created)
    first.database.close()
    await first.observationSystem.observability.flush()
    const reopened = setup(databasePath)

    expect(reopened.bots.get({ id: created.id })).toEqual(created)
    reopened.database.close()
    await reopened.observationSystem.observability.flush()
  })

  test("rejects an unavailable provider without writing a bot", async () => {
    const { bots, database, observationSystem } = setup(join(directory, `${crypto.randomUUID()}.sqlite`), [{ provider: "codex", status: "unauthenticated" }])

    expect(() => bots.create(input)).toThrow("Provider codex is not available")
    expect(bots.list()).toEqual([])
    database.close()
    await observationSystem.observability.flush()
  })

  test("records identifiers but not function text", async () => {
    const { bots, database, observationSystem } = setup()
    const created = await bots.create(input)
    bots.list()
    bots.get({ id: created.id })
    await observationSystem.observability.flush()
    const observations = JSON.stringify(observationSystem.diagnostics.recent())

    expect(observations).toContain(created.id)
    expect(observations).not.toContain(input.function.outcome)
    expect(observations).not.toContain(input.function.responsibilities)
    database.close()
  })
})
