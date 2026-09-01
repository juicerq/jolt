import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import { createObservationSystem } from "@src/engine/observability/observability"
import { openDatabase } from "@src/engine/persistence/database"
import { createTasks } from "@src/engine/tasks/tasks"
import { testDirectory } from "../../support/test-directory"

const directory = testDirectory("jolt-tasks-")
const botFunction = { outcome: "Answer", description: "Help" }

function setup() {
  const system = createObservationSystem({ appSessionId: crypto.randomUUID(), logDirectory: join(directory, "logs"), development: false })
  const database = openDatabase(join(directory, `${crypto.randomUUID()}.sqlite`), system.observability)
  const leader = database.bots.create({ id: crypto.randomUUID(), leaderBotId: null, projectId: null, name: "Atlas", provider: "codex", function: botFunction, workingDirectoryOverride: null, temporary: false, memoryEnabled: true, createdAt: new Date().toISOString() })
  const member = database.bots.create({ id: crypto.randomUUID(), leaderBotId: leader.id, projectId: null, name: "Calo", provider: "codex", function: botFunction, workingDirectoryOverride: null, temporary: false, memoryEnabled: true, createdAt: new Date().toISOString() })

  async function close() {
    database.close()
    await system.observability.flush()
  }

  return { close, database, leader, member, observability: system.observability }
}

describe("tasks", () => {
  test("a Tarefa left working by a previous Engine run is interrupted on startup", async () => {
    const environment = setup()
    const before = createTasks({ database: environment.database, observability: environment.observability })
    const orphan = before.create({ leaderBotId: environment.leader.id, assigneeBotId: environment.member.id, outcome: "Rodar os testes" })
    const finished = before.finish(before.create({ leaderBotId: environment.leader.id, assigneeBotId: environment.member.id, outcome: "Revisar" }).id, "done")

    const after = createTasks({ database: environment.database, observability: environment.observability })

    expect(after.get(orphan.id)).toMatchObject({ status: "interrupted" })
    expect(after.get(orphan.id)?.finishedAt).not.toBeNull()
    expect(after.get(finished.id)).toMatchObject({ status: "done", finishedAt: finished.finishedAt })
    await environment.close()
  })
})
