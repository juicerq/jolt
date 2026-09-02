import { describe, expect, test } from "bun:test"
import { botSchemas } from "@src/shared/bots"

const input = {
  name: "Marina",
  provider: "codex" as const,
  function: {
    outcome: "Contratos prontos",
    description: "Preparar propostas",
  },
}

describe("bot boundary", () => {
  test("a stored Bot carries its Esforço and the update input only accepts the three levels", () => {
    const stored = { id: "b1", leaderBotId: null, projectId: null, name: "Marina", provider: "codex" as const, function: { outcome: "Contratos prontos" }, workingDirectoryOverride: null, temporary: false, memoryEnabled: true, effort: "high" as const, model: null, permissionMode: "ask" as const, createdAt: "2026-09-01T12:00:00.000Z" }

    expect(botSchemas.storedBot.parse(stored)).toEqual(stored)
    expect(() => botSchemas.storedBot.parse({ ...stored, effort: "off" })).toThrow()
    expect(() => botSchemas.storedBot.parse({ ...stored, permissionMode: "sometimes" })).toThrow()
    expect(() => botSchemas.updateInput.parse({ id: "b1", name: "Marina", function: { outcome: "Contratos prontos" }, projectId: null, workingDirectoryOverride: null, memoryEnabled: true })).toThrow()
  })

  test("accepts a standalone bot creation input", () => {
    expect(botSchemas.createInput.parse(input)).toEqual(input)
    expect(botSchemas.createInput.parse({ ...input, projectId: "project-1", workingDirectoryOverride: "/projects/jolt" })).toEqual({
      ...input,
      projectId: "project-1",
      workingDirectoryOverride: "/projects/jolt",
    })
  })

  test("accepts a Função without a description and rejects the old four fields", () => {
    const outcomeOnly = { ...input, function: { outcome: "Contratos prontos" } }

    expect(botSchemas.createInput.parse(outcomeOnly)).toEqual(outcomeOnly)
    expect(() => botSchemas.createInput.parse({ ...input, function: { ...input.function, responsibilities: "Preparar propostas" } })).toThrow()
    expect(() => botSchemas.createInput.parse({ ...input, function: { ...input.function, description: "" } })).toThrow()
  })

  test("accepts changing the name, the Função, the Project and the working directory override together", () => {
    expect(botSchemas.updateInput.parse({ id: "bot-1", name: "Marina", function: input.function, projectId: "project-1", workingDirectoryOverride: "/projects/jolt", memoryEnabled: true, effort: "medium", model: null, permissionMode: "ask" })).toEqual({
      id: "bot-1",
      name: "Marina",
      function: input.function,
      projectId: "project-1",
      workingDirectoryOverride: "/projects/jolt",
      memoryEnabled: true, effort: "medium", model: null, permissionMode: "ask",
    })
    expect(botSchemas.updateInput.parse({ id: "bot-1", name: "Marina", function: { outcome: "Contratos" }, projectId: null, workingDirectoryOverride: null, memoryEnabled: false, effort: "medium", model: null, permissionMode: "read-only" })).toEqual({
      id: "bot-1",
      name: "Marina",
      function: { outcome: "Contratos" },
      projectId: null,
      workingDirectoryOverride: null,
      memoryEnabled: false, effort: "medium", model: null, permissionMode: "read-only",
    })
    expect(() => botSchemas.updateInput.parse({ id: "bot-1", name: "", function: input.function, projectId: null, workingDirectoryOverride: null, memoryEnabled: true, effort: "medium", model: null, permissionMode: "ask" })).toThrow()
    expect(() => botSchemas.updateInput.parse({ id: "bot-1", name: "Marina", function: input.function, projectId: null, workingDirectoryOverride: null })).toThrow()
  })

  test("pairs each execution setting with its own value", () => {
    expect(botSchemas.updateExecutionInput.parse({ id: "bot-1", setting: "effort", value: "high" })).toEqual({ id: "bot-1", setting: "effort", value: "high" })
    expect(botSchemas.updateExecutionInput.parse({ id: "bot-1", setting: "model", value: null })).toEqual({ id: "bot-1", setting: "model", value: null })
    expect(botSchemas.updateExecutionInput.parse({ id: "bot-1", setting: "permissionMode", value: "full" })).toEqual({ id: "bot-1", setting: "permissionMode", value: "full" })
    expect(() => botSchemas.updateExecutionInput.parse({ id: "bot-1", setting: "permissionMode", value: "high" })).toThrow()
  })

  test("accepts a member creation input that names its Leader instead of a Project", () => {
    expect(botSchemas.createInput.parse({ ...input, leaderBotId: "bot-1" })).toEqual({ ...input, leaderBotId: "bot-1" })
    expect(() => botSchemas.createInput.parse({ ...input, role: "leader" })).toThrow()
    expect(() => botSchemas.createInput.parse({ ...input, leaderBotId: "bot-1", projectId: "project-1" })).toThrow()
  })
})
