import { Database } from "bun:sqlite"
import { drizzle } from "drizzle-orm/bun-sqlite"
import { sql } from "drizzle-orm"
import { migrations } from "./migrations"
import type { Observability } from "../observability/observability"

export function openDatabase(path: string, observability: Observability) {
  const sqlite = new Database(path, { create: true })
  const database = drizzle(sqlite)

  observability.span({ name: "database.migrate" }, () => {
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
  })

  return {
    migrationState() {
      return observability.span({ name: "database.transaction" }, () =>
        database
          .all<{ id: number }>(sql`SELECT id FROM __drizzle_migrations ORDER BY id`)
          .map((entry) => entry.id),
      )
    },
    close() {
      sqlite.close()
    },
  }
}
