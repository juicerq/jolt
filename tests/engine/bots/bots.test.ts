import { describe, expect, test } from "bun:test"
import { mkdir, stat } from "node:fs/promises"
import { join } from "node:path"
import { createBots } from "@src/engine/bots/bots"
import { createObservationSystem } from "@src/engine/observability/observability"
import { openDatabase } from "@src/engine/persistence/database"
import { createProjects } from "@src/engine/projects/projects"
import type { ProviderAvailability } from "@src/shared/providers"
import { testDirectory } from "../../support/test-directory"

const directory = testDirectory("jolt-bots-")
const input = {
  name: "Marina",
  provider: "codex" as const,
  function: {
    outcome: "Contratos prontos",
    responsibilities: "Preparar propostas",
    limits: "Não altera preços",
    delivery: "Proposta para revisão",
  },
}

function setup(options?: { databasePath?: string; providerList?: ProviderAvailability[]; privateBotsDirectory?: string }) {
  const databasePath = options?.databasePath ?? join(directory, `${crypto.randomUUID()}.sqlite`)
  const providerList = options?.providerList ?? [{ provider: "codex" as const, status: "available" as const }]
  const privateBotsDirectory = options?.privateBotsDirectory ?? join(directory, crypto.randomUUID())
  const observationSystem = createObservationSystem({ appSessionId: crypto.randomUUID(), logDirectory: join(directory, crypto.randomUUID()), development: false })
  const database = openDatabase(databasePath, observationSystem.observability)
  const bots = createBots({ database, observability: observationSystem.observability, privateBotsDirectory, providers: { list: async () => providerList } })
  const projects = createProjects({ database, observability: observationSystem.observability, bots })

  return { bots, database, observationSystem, privateBotsDirectory, projects }
}

describe("bots", () => {
  test("creates, lists, and gets a persistent standalone bot", async () => {
    const databasePath = join(directory, `${crypto.randomUUID()}.sqlite`)
    const first = setup({ databasePath })
    const created = await first.bots.create(input)

    expect(created).toEqual({
      id: created.id,
      leaderBotId: null,
      projectId: null,
      ...input,
      workingDirectoryOverride: null,
      temporary: false,
      effectiveWorkingDirectory: join(first.privateBotsDirectory, created.id),
      closed: false,
      createdAt: expect.any(String),
    })
    expect(created.effectiveWorkingDirectory).toBe(join(first.privateBotsDirectory, created.id))
    expect(await first.bots.list()).toEqual([created])
    expect(await first.bots.get({ id: created.id })).toEqual(created)
    first.database.close()
    await first.observationSystem.observability.flush()
    const reopened = setup({ databasePath, privateBotsDirectory: first.privateBotsDirectory })

    expect(await reopened.bots.get({ id: created.id })).toEqual(created)
    reopened.database.close()
    await reopened.observationSystem.observability.flush()
  })

  test("creates a member that inherits the Leader Project and folder unless given its own folder", async () => {
    const { bots, database, observationSystem, projects } = setup()
    const projectDirectory = join(directory, crypto.randomUUID())
    const leaderDirectory = join(directory, crypto.randomUUID())
    const ownDirectory = join(directory, crypto.randomUUID())
    await mkdir(projectDirectory)
    await mkdir(leaderDirectory)
    await mkdir(ownDirectory)
    const project = await projects.create({ name: "Jolt", defaultWorkingDirectory: projectDirectory })
    const leader = await bots.create({ ...input, projectId: project.id, workingDirectoryOverride: leaderDirectory })
    const inheriting = await bots.create({ ...input, name: "Lia", leaderBotId: leader.id })
    const own = await bots.create({ ...input, name: "Calo", leaderBotId: leader.id, workingDirectoryOverride: ownDirectory })

    expect(inheriting).toEqual({ ...leader, id: inheriting.id, name: "Lia", leaderBotId: leader.id, createdAt: inheriting.createdAt })
    expect(own).toMatchObject({ leaderBotId: leader.id, projectId: project.id, workingDirectoryOverride: ownDirectory, effectiveWorkingDirectory: ownDirectory })
    expect(() => bots.create({ ...input, leaderBotId: inheriting.id })).toThrow("A member cannot lead")
    expect(() => bots.create({ ...input, leaderBotId: "missing-bot" })).toThrow("Leader not found")
    expect((await bots.list()).toSorted((left, right) => left.name.localeCompare(right.name))).toEqual([own, inheriting, leader])
    database.close()
    await observationSystem.observability.flush()
  })

  test("rejects an unavailable provider without writing a bot", async () => {
    const { bots, database, observationSystem } = setup({ providerList: [{ provider: "codex", status: "unauthenticated" }] })

    expect(() => bots.create(input)).toThrow("Provider codex is not available")
    expect(await bots.list()).toEqual([])
    database.close()
    await observationSystem.observability.flush()
  })

  test("creates and resolves a private working directory when none is chosen", async () => {
    const { bots, database, observationSystem, privateBotsDirectory } = setup()
    const created = await bots.create(input)
    const effectiveDirectory = await bots.resolveWorkingDirectory({ id: created.id })

    expect(created.workingDirectoryOverride).toBeNull()
    expect(effectiveDirectory).toBe(join(privateBotsDirectory, created.id))
    expect((await stat(effectiveDirectory)).isDirectory()).toBe(true)
    database.close()
    await observationSystem.observability.flush()
  })

  test("uses an override before the Project default and the private directory", async () => {
    const { bots, database, observationSystem, privateBotsDirectory, projects } = setup()
    const projectDirectory = join(directory, crypto.randomUUID())
    const chosenDirectory = join(directory, crypto.randomUUID())
    const replacementDirectory = join(directory, crypto.randomUUID())
    await mkdir(projectDirectory)
    await mkdir(chosenDirectory)
    await mkdir(replacementDirectory)
    const project = await projects.create({ name: "Jolt", defaultWorkingDirectory: projectDirectory })
    const created = await bots.create({ ...input, projectId: project.id, workingDirectoryOverride: chosenDirectory })

    expect(await bots.resolveWorkingDirectory({ id: created.id })).toBe(chosenDirectory)
    expect((await stat(join(privateBotsDirectory, created.id))).isDirectory()).toBe(true)
    expect(await bots.updateWorkspace({ id: created.id, projectId: project.id, workingDirectoryOverride: replacementDirectory })).toEqual({
      ...created,
      workingDirectoryOverride: replacementDirectory,
      effectiveWorkingDirectory: replacementDirectory,
    })
    expect(await bots.resolveWorkingDirectory({ id: created.id })).toBe(replacementDirectory)
    expect(await bots.updateWorkspace({ id: created.id, projectId: project.id, workingDirectoryOverride: null })).toEqual({
      ...created,
      workingDirectoryOverride: null,
      effectiveWorkingDirectory: projectDirectory,
    })
    expect(await bots.resolveWorkingDirectory({ id: created.id })).toBe(projectDirectory)
    expect(await bots.updateWorkspace({ id: created.id, projectId: null, workingDirectoryOverride: null })).toEqual({
      ...created,
      projectId: null,
      workingDirectoryOverride: null,
      effectiveWorkingDirectory: join(privateBotsDirectory, created.id),
    })
    database.close()
    await observationSystem.observability.flush()
  })

  test("rejects a missing working directory without writing a bot", async () => {
    const { bots, database, observationSystem } = setup()
    const missingDirectory = join(directory, crypto.randomUUID(), "missing")

    expect(() => bots.create({ ...input, workingDirectoryOverride: missingDirectory })).toThrow("Working directory is not accessible")
    expect(await bots.list()).toEqual([])
    database.close()
    await observationSystem.observability.flush()
  })

  test("rejects creating a Bot in a missing Project without writing it", async () => {
    const { bots, database, observationSystem } = setup()

    expect(() => bots.create({ ...input, projectId: "missing-project" })).toThrow("Project not found")
    expect(await bots.list()).toEqual([])
    database.close()
    await observationSystem.observability.flush()
  })

  test("rejects moving a Bot to a missing Project without changing it", async () => {
    const { bots, database, observationSystem } = setup()
    const created = await bots.create(input)

    expect(() => bots.updateWorkspace({ id: created.id, projectId: "missing-project", workingDirectoryOverride: null })).toThrow("Project not found")
    expect(await bots.get({ id: created.id })).toEqual(created)
    database.close()
    await observationSystem.observability.flush()
  })

  test("moves a Leader and every member to the same Project atomically while preserving member overrides", async () => {
    const { bots, database, observationSystem, projects } = setup()
    const firstProjectDirectory = join(directory, crypto.randomUUID())
    const nextProjectDirectory = join(directory, crypto.randomUUID())
    const leaderOverride = join(directory, crypto.randomUUID())
    const memberOverride = join(directory, crypto.randomUUID())
    await mkdir(firstProjectDirectory)
    await mkdir(nextProjectDirectory)
    await mkdir(leaderOverride)
    await mkdir(memberOverride)
    const firstProject = await projects.create({ name: "Jolt", defaultWorkingDirectory: firstProjectDirectory })
    const nextProject = await projects.create({ name: "Dogama", defaultWorkingDirectory: nextProjectDirectory })
    const leader = await bots.create({ ...input, projectId: firstProject.id })
    const member = database.bots.create({
      id: crypto.randomUUID(),
      leaderBotId: leader.id,
      projectId: firstProject.id,
      name: "Calo",
      provider: "codex",
      function: input.function,
      workingDirectoryOverride: memberOverride,
      temporary: false,
      createdAt: new Date().toISOString(),
    })

    expect(() => bots.updateWorkspace({ id: member.id, projectId: null, workingDirectoryOverride: null })).toThrow("A member must remain in the Leader Project")
    expect(await bots.updateWorkspace({ id: leader.id, projectId: nextProject.id, workingDirectoryOverride: leaderOverride })).toEqual({
      ...leader,
      projectId: nextProject.id,
      workingDirectoryOverride: leaderOverride,
      effectiveWorkingDirectory: leaderOverride,
    })
    expect(await bots.get({ id: member.id })).toEqual({
      ...member,
      closed: false,
      projectId: nextProject.id,
      workingDirectoryOverride: memberOverride,
      effectiveWorkingDirectory: memberOverride,
    })
    database.close()
    await observationSystem.observability.flush()
  })

  test("records identifiers but not function text", async () => {
    const { bots, database, observationSystem } = setup()
    const created = await bots.create(input)
    await bots.list()
    await bots.get({ id: created.id })
    await observationSystem.observability.flush()
    const observations = JSON.stringify(observationSystem.diagnostics.recent())

    expect(observations).toContain(created.id)
    expect(observations).not.toContain(input.function.outcome)
    expect(observations).not.toContain(input.function.responsibilities)
    database.close()
  })
})
