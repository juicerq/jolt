import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import { Database } from "bun:sqlite"
import { createObservationSystem } from "@src/engine/observability/observability"
import { openDatabase } from "@src/engine/persistence/database"
import { testDirectory } from "../../support/test-directory"

const directory = testDirectory("jolt-database-")

describe("database", () => {
  test("opens a new database with Bots, conversations, and the migration journal", async () => {
    const databasePath = join(directory, "database.sqlite")
    const { observability } = createObservationSystem({
      appSessionId: "database-test",
      logDirectory: join(directory, "logs"),
      development: false,
    })
    const database = openDatabase(databasePath, observability)
    expect(database.migrationState()).toEqual(["20260831155650_initial-schema", "20260901003757_leader-delegation", "20260901111156_turn-ending"])
    database.close()
    const sqlite = new Database(databasePath)
    const migration = sqlite.query<{ count: number }, []>("select count(*) as count from __drizzle_migrations").get()
    const bots = sqlite
      .query<{ name: string }, []>("select name from sqlite_master where type = 'table' and name = 'bots'")
      .get()
    const conversations = sqlite
      .query<{ name: string }, []>("select name from sqlite_master where type = 'table' and name = 'conversations'")
      .get()
    const projects = sqlite
      .query<{ name: string }, []>("select name from sqlite_master where type = 'table' and name = 'projects'")
      .get()
    const messages = sqlite
      .query<{ name: string }, []>("select name from sqlite_master where type = 'table' and name = 'messages'")
      .get()
    const botColumns = sqlite.query<{ name: string }, []>("pragma table_info(bots)").all().map((column) => column.name)
    const messageColumns = sqlite.query<{ name: string }, []>("pragma table_info(messages)").all().map((column) => column.name)
    sqlite.close()
    await observability.flush()

    expect(migration?.count).toBe(3)
    expect(bots?.name).toBe("bots")
    expect(projects?.name).toBe("projects")
    expect(conversations?.name).toBe("conversations")
    expect(messages?.name).toBe("messages")
    expect(botColumns).toContain("function")
    expect(botColumns).toContain("project_id")
    expect(botColumns).toContain("working_directory_override")
    expect(botColumns).not.toContain("function_outcome")
    expect(messageColumns).toContain("activity")
  })
})
