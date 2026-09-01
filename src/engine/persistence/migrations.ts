import type { MigrationsJournal } from "drizzle-orm/migrator"
import initialSchema from "../../../drizzle/20260901132949_initial-schema/migration.sql" with { type: "text" }
import routines from "../../../drizzle/20260901184631_routines/migration.sql" with { type: "text" }

export const migrations = [
  { name: "20260901132949_initial-schema", timestamp: 1788269389000, sql: initialSchema },
  { name: "20260901184631_routines", timestamp: 1788288391000, sql: routines },
] satisfies MigrationsJournal
