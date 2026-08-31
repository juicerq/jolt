import { index, snakeCase, text } from "drizzle-orm/sqlite-core"
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core"
import type { Bot } from "../../shared/bots"

export const bots = snakeCase.table("bots", {
  id: text().primaryKey(),
  leaderBotId: text().references((): AnySQLiteColumn => bots.id, { onDelete: "cascade" }),
  name: text().notNull(),
  provider: text({ enum: ["codex", "claude"] }).notNull(),
  function: text({ mode: "json" }).$type<Bot["function"]>().notNull(),
  createdAt: text().notNull(),
}, (table) => [index("bots_leader_bot_id").on(table.leaderBotId)])
