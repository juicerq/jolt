import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import { Database } from "bun:sqlite"
import { createObservationSystem } from "@src/engine/observability/observability"
import { openDatabase } from "@src/engine/persistence/database"
import { testDirectory } from "../../support/test-directory"

const directory = testDirectory("jots-database-")

describe("database", () => {
  test("applies every migration when opening a new database", async () => {
    const databasePath = join(directory, "database.sqlite")
    const { observability } = createObservationSystem({
      appSessionId: "database-test",
      logDirectory: join(directory, "logs"),
      development: false,
    })
    const database = openDatabase(databasePath, observability)
    database.close()
    const sqlite = new Database(databasePath)
    const migration = sqlite.query<{ count: number }, []>("select count(*) as count from __drizzle_migrations").get()
    const applicationState = sqlite
      .query<{ name: string }, []>("select name from sqlite_master where type = 'table' and name = 'application_state'")
      .get()
    const teams = sqlite
      .query<{ name: string }, []>("select name from sqlite_master where type = 'table' and name = 'teams'")
      .get()
    const bots = sqlite
      .query<{ name: string }, []>("select name from sqlite_master where type = 'table' and name = 'bots'")
      .get()
    sqlite.close()
    await observability.flush()

    expect(migration?.count).toBe(2)
    expect(applicationState?.name).toBe("application_state")
    expect(teams?.name).toBe("teams")
    expect(bots?.name).toBe("bots")
  })

  test("prevents a second leader in the same team", async () => {
    const databasePath = join(directory, "database.sqlite")
    const { observability } = createObservationSystem({
      appSessionId: "database-test",
      logDirectory: join(directory, "logs"),
      development: false,
    })
    const database = openDatabase(databasePath, observability)
    database.close()
    const sqlite = new Database(databasePath)
    sqlite.run("PRAGMA foreign_keys = ON")
    sqlite.run("INSERT INTO teams VALUES (?, ?, ?, ?, ?)", ["team-1", "Vendas", "Fechar contratos", "codex", "2026-08-30T00:00:00.000Z"])
    sqlite.run("INSERT INTO teams VALUES (?, ?, ?, ?, ?)", ["team-2", "Suporte", "Resolver pedidos", "claude", "2026-08-30T00:00:00.000Z"])
    const leader = ["leader-1", "team-1", "Líder", "leader", "codex", "Resultado", "Responsabilidades", "Limites", "Entrega", "2026-08-30T00:00:00.000Z"]
    sqlite.run("INSERT INTO bots VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", leader)

    expect(() => sqlite.run("INSERT INTO bots VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [
      "leader-2", "team-1", "Outro Líder", "leader", "codex", "Resultado", "Responsabilidades", "Limites", "Entrega", "2026-08-30T00:00:00.000Z",
    ])).toThrow()
    expect(() => sqlite.run("INSERT INTO bots VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [
      "leader-3", "team-2", "Líder", "leader", "claude", "Resultado", "Responsabilidades", "Limites", "Entrega", "2026-08-30T00:00:00.000Z",
    ])).not.toThrow()

    sqlite.close()
    await observability.flush()
  })

  test("rolls back the team when its leader cannot be stored", async () => {
    const databasePath = join(directory, "database.sqlite")
    const { observability } = createObservationSystem({
      appSessionId: "database-test",
      logDirectory: join(directory, "logs"),
      development: false,
    })
    const database = openDatabase(databasePath, observability)
    const base = {
      name: "Vendas",
      objective: "Fechar contratos",
      defaultProvider: "codex" as const,
      createdAt: "2026-08-30T00:00:00.000Z",
      leader: {
        id: "same-leader",
        name: "Líder",
        role: "leader" as const,
        provider: "codex" as const,
        function: {
          outcome: "Contratos",
          responsibilities: "Negociar",
          limits: "Sem descontos",
          delivery: "Propostas",
        },
        createdAt: "2026-08-30T00:00:00.000Z",
      },
    }
    database.teams.create({ id: "team-1", ...base })

    expect(() => database.teams.create({ id: "team-2", ...base })).toThrow()

    database.close()
    const sqlite = new Database(databasePath)
    const orphan = sqlite.query<{ count: number }, []>("SELECT count(*) AS count FROM teams WHERE id = 'team-2'").get()
    sqlite.close()
    await observability.flush()

    expect(orphan?.count).toBe(0)
  })
})
