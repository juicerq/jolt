import type { MigrationsJournal } from "drizzle-orm/migrator"
import createBots from "../../../drizzle/20260831102905_create-bots/migration.sql" with { type: "text" }

export const migrations = [
  { name: "20260831102905_create-bots", timestamp: 1788172145000, sql: createBots },
] satisfies MigrationsJournal
