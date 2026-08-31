import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import { Database } from "bun:sqlite"
import { createObservationSystem } from "@src/engine/observability/observability"
import { openDatabase } from "@src/engine/persistence/database"
import { testDirectory } from "../../support/test-directory"

const directory = testDirectory("jots-database-")

describe("database", () => {
  test("opens a new database with the Bot schema and migration journal", async () => {
    const databasePath = join(directory, "database.sqlite")
    const { observability } = createObservationSystem({
      appSessionId: "database-test",
      logDirectory: join(directory, "logs"),
      development: false,
    })
    const database = openDatabase(databasePath, observability)
    expect(database.migrationState()).toEqual(["20260831101537_create-bots"])
    database.close()
    const sqlite = new Database(databasePath)
    const migration = sqlite.query<{ count: number }, []>("select count(*) as count from __drizzle_migrations").get()
    const bots = sqlite
      .query<{ name: string }, []>("select name from sqlite_master where type = 'table' and name = 'bots'")
      .get()
    const botColumns = sqlite.query<{ name: string }, []>("pragma table_info(bots)").all().map((column) => column.name)
    sqlite.close()
    await observability.flush()

    expect(migration?.count).toBe(1)
    expect(bots?.name).toBe("bots")
    expect(botColumns).toContain("function")
    expect(botColumns).not.toContain("function_outcome")
  })
})
