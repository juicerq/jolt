import { Database } from "bun:sqlite"
import { drizzle } from "drizzle-orm/bun-sqlite"
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core"

const counters = sqliteTable("counters", {
  id: integer("id").primaryKey(),
  value: integer("value").notNull(),
  updatedAt: text("updated_at").notNull(),
})

export function openPrototypeDatabase(path: string) {
  const sqlite = new Database(path, { create: true })
  const database = drizzle(sqlite)

  sqlite.run("CREATE TABLE IF NOT EXISTS counters (id INTEGER PRIMARY KEY, value INTEGER NOT NULL, updated_at TEXT NOT NULL)")
  sqlite.run("INSERT OR IGNORE INTO counters (id, value, updated_at) VALUES (1, 0, ?)", [new Date().toISOString()])

  return {
    read() {
      const row = database.select().from(counters).get()

      if (!row) {
        throw new Error("Prototype counter is missing")
      }

      return { value: row.value, updatedAt: row.updatedAt }
    },
    increment() {
      const current = database.select().from(counters).get()

      if (!current) {
        throw new Error("Prototype counter is missing")
      }

      const next = {
        value: current.value + 1,
        updatedAt: new Date().toISOString(),
      }

      database.update(counters).set(next).where(eq(counters.id, 1)).run()

      return next
    },
    close() {
      sqlite.close()
    },
  }
}

import { eq } from "drizzle-orm"
