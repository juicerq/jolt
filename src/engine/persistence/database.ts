import { Database } from "bun:sqlite"
import { drizzle } from "drizzle-orm/bun-sqlite"
import { sql } from "drizzle-orm"
import { migrations } from "./migrations"

export function openDatabase(path: string) {
  const sqlite = new Database(path, { create: true })
  const database = drizzle(sqlite)

  database.run(sql.raw("CREATE TABLE IF NOT EXISTS __drizzle_migrations (id INTEGER PRIMARY KEY NOT NULL)"))

  for (const migration of migrations) {
    const applied = sqlite.query<{ id: number }, [number]>("SELECT id FROM __drizzle_migrations WHERE id = ?").get(migration.id)

    if (applied) {
      continue
    }

    sqlite.transaction(() => {
      database.run(sql.raw(migration.sql))
      database.run(sql`INSERT INTO __drizzle_migrations (id) VALUES (${migration.id})`)
    })()
  }

  return {
    close() {
      sqlite.close()
    },
  }
}
