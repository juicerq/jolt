import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import { createObservationSystem } from "@src/engine/observability/observability"
import { openDatabase } from "@src/engine/persistence/database"
import { createTeams } from "@src/engine/teams/teams"
import type { ProviderAvailability } from "@src/shared/providers"
import { testDirectory } from "../../support/test-directory"

const directory = testDirectory("jots-teams-")

function setup(providerList: ProviderAvailability[] = [{ provider: "codex", status: "available" }]) {
  const observationSystem = createObservationSystem({
    appSessionId: "teams-test",
    logDirectory: join(directory, "logs"),
    development: false,
  })
  const database = openDatabase(join(directory, "database.sqlite"), observationSystem.observability)
  const teams = createTeams({
    database,
    observability: observationSystem.observability,
    providers: { list: async () => providerList },
  })

  return { database, observationSystem, teams }
}

const input = {
  name: "Vendas",
  objective: "Transformar interesse em contratos assinados",
  defaultProvider: "codex" as const,
  leader: {
    name: "Líder de vendas",
    function: {
      outcome: "Contratos prontos para assinatura",
      responsibilities: "Distribuir contatos e revisar propostas",
      limits: "Não altera preços sem ordem direta",
      delivery: "Resumo com proposta e próximos passos",
    },
  },
}

describe("teams", () => {
  test("creates a team and exactly one leader in one transaction", async () => {
    const { database, observationSystem, teams } = setup()

    const created = await teams.create(input)

    expect(created).toEqual({
      id: expect.any(String),
      name: input.name,
      objective: input.objective,
      defaultProvider: "codex",
      createdAt: expect.any(String),
      leader: {
        id: expect.any(String),
        name: input.leader.name,
        role: "leader",
        provider: "codex",
        function: input.leader.function,
        createdAt: expect.any(String),
      },
    })
    expect(teams.list()).toEqual([created])
    expect(teams.get({ id: created.id })).toEqual(created)

    database.close()
    await observationSystem.observability.flush()
  })

  test("rejects a provider whose authenticated session is unavailable", async () => {
    const { database, observationSystem, teams } = setup([
      { provider: "codex", status: "unauthenticated", version: "0.151.0" },
    ])

    expect(() => teams.create(input)).toThrow("Provider codex is not available")
    expect(teams.list()).toEqual([])

    database.close()
    await observationSystem.observability.flush()
  })

  test("keeps the team after reopening the database", async () => {
    const first = setup()
    const created = await first.teams.create(input)
    first.database.close()
    await first.observationSystem.observability.flush()

    const second = setup()

    expect(second.teams.get({ id: created.id })).toEqual(created)

    second.database.close()
    await second.observationSystem.observability.flush()
  })

  test("observations contain identifiers but no function text", async () => {
    const { database, observationSystem, teams } = setup()

    const created = await teams.create(input)
    teams.list()
    teams.get({ id: created.id })
    await observationSystem.observability.flush()
    const serialized = JSON.stringify(observationSystem.diagnostics.recent())
    const spanNames = observationSystem.diagnostics.recent().map((observation) => observation.name)

    expect(serialized).toContain(created.id)
    expect(serialized).not.toContain(input.leader.function.outcome)
    expect(serialized).not.toContain(input.leader.function.responsibilities)
    expect(serialized).not.toContain(input.leader.function.limits)
    expect(serialized).not.toContain(input.leader.function.delivery)
    expect(spanNames).toContain("database.teamlist")
    expect(spanNames).toContain("database.teamget")

    database.close()
  })
})
