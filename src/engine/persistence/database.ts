import { Database } from "bun:sqlite"
import { asc, eq, isNull, sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/bun-sqlite"
import { migrate } from "drizzle-orm/bun-sqlite/migrator"
import type { Bot } from "../../shared/bots"
import { botSchemas } from "../../shared/bots"
import type { Observability } from "../observability/observability"
import { migrations } from "./migrations"
import { bots } from "./schema"

export function openDatabase(path: string, observability: Observability) {
  const sqlite = new Database(path, { create: true })
  const database = drizzle({ client: sqlite })

  sqlite.run("PRAGMA foreign_keys = ON")
  observability.span({ name: "database.migrate" }, () => {
    migrate(database, migrations)
  })

  return {
    bots: {
      create(bot: Bot) {
        return observability.span({ name: "database.botcreate", context: { botId: bot.id, provider: bot.provider } }, () => {
          database.insert(bots).values(bot).run()
          return bot
        })
      },
      list() {
        return observability.span({ name: "database.botlist" }, () => botSchemas.botList.assert(database.select().from(bots).where(isNull(bots.leaderBotId)).orderBy(asc(bots.createdAt), asc(bots.id)).all()))
      },
      get(id: string) {
        return observability.span({ name: "database.botget", context: { botId: id } }, () => {
          const row = database.select().from(bots).where(eq(bots.id, id)).get()
          return row ? botSchemas.bot.assert(row) : undefined
        })
      },
    },
    migrationState() {
      return observability.span({ name: "database.transaction" }, () => database.all<{ name: string }>(sql`SELECT name FROM __drizzle_migrations ORDER BY id`).map((entry) => entry.name))
    },
    close() {
      sqlite.close()
    },
  }
}

export type AppDatabase = ReturnType<typeof openDatabase>
