import { afterEach, describe, expect, test } from "bun:test"
import { existsSync, rmSync } from "node:fs"
import { join } from "node:path"
import { Database } from "bun:sqlite"
import { openDatabase } from "./database"

const databasePath = join(import.meta.dir, "database.test.sqlite")

afterEach(() => {
  if (existsSync(databasePath)) {
    rmSync(databasePath)
  }
})

describe("database", () => {
  test("applies the initial migration when opening a new database", () => {
    const database = openDatabase(databasePath)
    database.close()
    const sqlite = new Database(databasePath)
    const migration = sqlite.query<{ count: number }, []>("select count(*) as count from __drizzle_migrations").get()
    const applicationState = sqlite
      .query<{ name: string }, []>("select name from sqlite_master where type = 'table' and name = 'application_state'")
      .get()
    sqlite.close()

    expect(migration?.count).toBe(1)
    expect(applicationState?.name).toBe("application_state")
  })
})
