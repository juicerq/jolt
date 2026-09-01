import type { MigrationsJournal } from "drizzle-orm/migrator"
import initialSchema from "../../../drizzle/20260901132949_initial-schema/migration.sql" with { type: "text" }

export const migrations = [
  { name: "20260901132949_initial-schema", timestamp: 1788269389000, sql: initialSchema },
] satisfies MigrationsJournal
