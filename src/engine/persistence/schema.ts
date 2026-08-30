import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core"

export const applicationState = sqliteTable("application_state", {
  id: integer("id").primaryKey(),
  createdAt: text("created_at").notNull(),
})
