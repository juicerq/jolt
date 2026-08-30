import { defineConfig } from "drizzle-kit"

export default defineConfig({
  dialect: "sqlite",
  schema: "src/engine/persistence/schema.ts",
  out: "drizzle",
})
