import { Database } from "bun:sqlite"
import { expect, test } from "bun:test"
import migration from "../../../drizzle/20260903142103_burly_maestro/migration.sql" with { type: "text" }

test("the avatar migration preserves the appearance of existing Bots", () => {
  const database = new Database(":memory:")
  database.run("CREATE TABLE bots (id text PRIMARY KEY NOT NULL, name text NOT NULL)")
  database.run("INSERT INTO bots (id, name) VALUES (?, ?)", ["b1", "Marina"])

  for (const statement of migration.split("--> statement-breakpoint")) {
    database.run(statement)
  }

  expect(database.query("SELECT avatar_seed AS avatarSeed FROM bots WHERE id = ?").get("b1")).toEqual({ avatarSeed: "jolt:b1:Marina" })
  database.close()
})
