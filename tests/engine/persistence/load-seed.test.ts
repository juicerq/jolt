import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import { createObservationSystem } from "@src/engine/observability/observability"
import { openDatabase } from "@src/engine/persistence/database"
import { seedLoadDatabase } from "@src/engine/persistence/load-seed"
import { testDirectory } from "../../support/test-directory"

const directory = testDirectory("jolt-load-seed-")

describe("load seed", () => {
  test("creates Bots with heavy histories that the app can read back", async () => {
    const created = await seedLoadDatabase(directory, 7)
    const { observability } = createObservationSystem({ appSessionId: "load-seed-test", logDirectory: join(directory, "logs"), development: false })
    const database = openDatabase(join(directory, "jolt.sqlite"), observability)
    const bots = database.bots.list()
    const leader = bots.find((bot) => bot.name === "Coordenador")
    const largest = bots.find((bot) => bot.name === "Enorme")

    expect(created.map((entry) => entry.name)).toEqual(["Leve", "Média", "Pesada", "Enorme", "Coordenador", "Pesquisador", "Redator"])
    expect(created.find((entry) => entry.name === "Enorme")?.messages).toBe(3000)
    expect(bots.filter((bot) => bot.leaderBotId === leader?.id).map((bot) => bot.name)).toEqual(["Pesquisador", "Redator"])
    expect(database.tasks.listForBot(leader?.id ?? "")).toHaveLength(400)

    const history = database.conversations.history(largest?.id ?? "", { limit: 500 }).messages

    expect(history.some((message) => message.activity !== null)).toBe(true)
    expect(history.some((message) => message.images.length > 0)).toBe(true)
    expect(history.some((message) => message.content.includes("```ts"))).toBe(true)

    database.close()
    await observability.flush()
  }, 30_000)
})
