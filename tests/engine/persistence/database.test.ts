import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import { Database } from "bun:sqlite"
import { createObservationSystem } from "@src/engine/observability/observability"
import { openDatabase } from "@src/engine/persistence/database"
import { testDirectory } from "../../support/test-directory"

const directory = testDirectory("jolt-database-")

function setup() {
  const { observability } = createObservationSystem({ appSessionId: crypto.randomUUID(), logDirectory: join(directory, "logs"), development: false })
  const database = openDatabase(join(directory, `${crypto.randomUUID()}.sqlite`), observability)
  const bot = database.bots.create({ id: crypto.randomUUID(), leaderBotId: null, projectId: null, name: "Atlas", provider: "codex", function: { outcome: "Answer" }, workingDirectoryOverride: null, temporary: false, memoryEnabled: true, createdAt: new Date().toISOString() })

  return { bot, database, observability }
}

describe("database", () => {
  test("opens a new database with Bots, conversations, and the migration journal", async () => {
    const databasePath = join(directory, "database.sqlite")
    const { observability } = createObservationSystem({
      appSessionId: "database-test",
      logDirectory: join(directory, "logs"),
      development: false,
    })
    const database = openDatabase(databasePath, observability)
    expect(database.migrationState()).toEqual(["20260901132949_initial-schema", "20260901184631_routines", "20260901200730_memory"])
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
    expect(botColumns).toContain("temporary")
    expect(botColumns).toContain("memory_enabled")
    expect(botColumns).not.toContain("function_outcome")
    expect(messageColumns).toContain("activity")
  })

  test("keeps Notas pending until curated and resolves the Origem of each Lembrança", async () => {
    const { bot, database, observability } = setup()
    const createdAt = new Date().toISOString()
    const later = new Date(Date.now() + 1000).toISOString()
    const message = database.conversations.append({ id: crypto.randomUUID(), botId: bot.id, author: "person", authorBotId: null, taskId: null, content: "Rode typecheck", activity: null, ending: null, createdAt })
    const first = database.notes.create({ id: crypto.randomUUID(), botId: bot.id, content: "A pessoa exige typecheck", turnAuthor: "person", taskId: null, messageId: message.id, createdAt, curatedAt: null })
    const second = database.notes.create({ id: crypto.randomUUID(), botId: bot.id, content: "Nada novo na caixa", turnAuthor: "routine", taskId: null, messageId: null, createdAt: later, curatedAt: null })

    expect(database.notes.listPending(bot.id).map((note) => note.id)).toEqual([first.id, second.id])
    expect(database.notes.pendingBotIds()).toEqual([bot.id])
    expect(database.notes.markCurated([first.id], createdAt)).toBe(1)
    expect(database.notes.markCurated([], createdAt)).toBe(0)
    expect(database.notes.listPending(bot.id).map((note) => note.id)).toEqual([second.id])

    const remembered = database.memories.create({ id: crypto.randomUUID(), botId: bot.id, content: "Run typecheck before delivering", origin: "bot", noteId: first.id, createdAt })
    const added = database.memories.create({ id: crypto.randomUUID(), botId: bot.id, content: "Prefers short replies", origin: "person", noteId: null, createdAt: later })

    expect(database.memories.listForBot(bot.id)).toEqual([
      { id: remembered.id, botId: bot.id, content: "Run typecheck before delivering", origin: "bot", turnAuthor: "person", createdAt },
      { id: added.id, botId: bot.id, content: "Prefers short replies", origin: "person", turnAuthor: null, createdAt: later },
    ])
    expect(database.memories.update(remembered.id, { content: "Always run typecheck" })?.content).toBe("Always run typecheck")
    expect(database.memories.get(remembered.id)?.noteId).toBe(first.id)
    expect(database.memories.remove(added.id)).toBe(1)
    expect(database.memories.removeForBot(bot.id)).toBe(1)
    expect(database.notes.removeForBot(bot.id)).toBe(2)
    expect(database.memories.listForBot(bot.id)).toEqual([])
    expect(database.notes.pendingBotIds()).toEqual([])
    database.close()
    await observability.flush()
  })

  test("excluding a Bot erases its Notas and Lembranças", async () => {
    const { bot, database, observability } = setup()
    const createdAt = new Date().toISOString()
    const note = database.notes.create({ id: crypto.randomUUID(), botId: bot.id, content: "Nota", turnAuthor: "bot", taskId: null, messageId: null, createdAt, curatedAt: null })
    database.memories.create({ id: crypto.randomUUID(), botId: bot.id, content: "Lembrança", origin: "bot", noteId: note.id, createdAt })
    database.bots.remove(bot.id)

    expect(database.notes.pendingBotIds()).toEqual([])
    expect(database.memories.listForBot(bot.id)).toEqual([])
    database.close()
    await observability.flush()
  })
})
