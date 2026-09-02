import { describe, expect, test } from "bun:test"
import { mkdir } from "node:fs/promises"
import { join } from "node:path"
import { createBots } from "@src/engine/bots/bots"
import { createObservationSystem } from "@src/engine/observability/observability"
import { openDatabase } from "@src/engine/persistence/database"
import { createProjects } from "@src/engine/projects/projects"
import { testDirectory } from "../../support/test-directory"

const directory = testDirectory("jolt-projects-")
const botInput = {
  name: "Marina",
  provider: "codex" as const,
  function: {
    outcome: "Contratos prontos",
    description: "Preparar propostas",
  },
}

function setup() {
  const observationSystem = createObservationSystem({ appSessionId: crypto.randomUUID(), logDirectory: join(directory, crypto.randomUUID()), development: false })
  const database = openDatabase(join(directory, `${crypto.randomUUID()}.sqlite`), observationSystem.observability)
  const bots = createBots({
    database,
    observability: observationSystem.observability,
    privateBotsDirectory: join(directory, "bots"),
    providers: { list: async () => [{ provider: "codex" as const, status: "available" as const }] },
    conversations: { async close() {} },
  })
  const projects = createProjects({ database, observability: observationSystem.observability, bots })

  return { bots, database, observationSystem, projects }
}

describe("projects", () => {
  test("creates an empty Project and includes it in the grouped Bot list", async () => {
    const { database, observationSystem, projects } = setup()
    const defaultWorkingDirectory = join(directory, crypto.randomUUID())
    await mkdir(defaultWorkingDirectory)
    const project = await projects.create({ name: "Jolt", defaultWorkingDirectory })

    expect(project).toEqual({ id: expect.any(String), name: "Jolt", defaultWorkingDirectory, createdAt: expect.any(String) })
    expect(await projects.list()).toEqual({ projects: [{ ...project, bots: [] }], unassignedBots: [] })
    database.close()
    await observationSystem.observability.flush()
  })

  test("groups top-level Bots under Projects and nests their members", async () => {
    const { bots, database, observationSystem, projects } = setup()
    const defaultWorkingDirectory = join(directory, crypto.randomUUID())
    await mkdir(defaultWorkingDirectory)
    const project = await projects.create({ name: "Jolt", defaultWorkingDirectory })
    const assigned = await bots.create({ ...botInput, projectId: project.id })
    const unassigned = await bots.create(botInput)
    const member = database.bots.create({
      id: crypto.randomUUID(),
      leaderBotId: assigned.id,
      projectId: project.id,
      name: "Calo",
      provider: "codex",
      function: botInput.function,
      workingDirectoryOverride: null,
      temporary: false,
      memoryEnabled: true, effort: "medium", model: null, permissionMode: "ask",
      createdAt: new Date().toISOString(),
    })

    expect(await projects.list()).toEqual({
      projects: [{ ...project, bots: [{ ...assigned, members: [{ ...member, effectiveWorkingDirectory: defaultWorkingDirectory, closed: false }] }] }],
      unassignedBots: [{ ...unassigned, members: [] }],
    })
    database.close()
    await observationSystem.observability.flush()
  })

  test("rejects a Project whose default working directory is inaccessible", async () => {
    const { database, observationSystem, projects } = setup()
    const missingDirectory = join(directory, crypto.randomUUID(), "missing")

    expect(() => projects.create({ name: "Jolt", defaultWorkingDirectory: missingDirectory })).toThrow("Working directory is not accessible")
    expect(await projects.list()).toEqual({ projects: [], unassignedBots: [] })
    database.close()
    await observationSystem.observability.flush()
  })
})
