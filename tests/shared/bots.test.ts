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
  test("accepts a standalone bot creation input", () => {
    expect(botSchemas.createInput.assert(input)).toEqual(input)
    expect(botSchemas.createInput.assert({ ...input, projectId: "project-1", workingDirectoryOverride: "/projects/jolt" })).toEqual({
      ...input,
      projectId: "project-1",
      workingDirectoryOverride: "/projects/jolt",
    })
  })

  test("accepts a Função without a description and rejects the old four fields", () => {
    const outcomeOnly = { ...input, function: { outcome: "Contratos prontos" } }

    expect(botSchemas.createInput.assert(outcomeOnly)).toEqual(outcomeOnly)
    expect(() => botSchemas.createInput.assert({ ...input, function: { ...input.function, responsibilities: "Preparar propostas" } })).toThrow()
    expect(() => botSchemas.createInput.assert({ ...input, function: { ...input.function, description: "" } })).toThrow()
  })

  test("accepts changing the name, the Função, the Project and the working directory override together", () => {
    expect(botSchemas.updateInput.assert({ id: "bot-1", name: "Marina", function: input.function, projectId: "project-1", workingDirectoryOverride: "/projects/jolt" })).toEqual({
      id: "bot-1",
      name: "Marina",
      function: input.function,
      projectId: "project-1",
      workingDirectoryOverride: "/projects/jolt",
    })
    expect(botSchemas.updateInput.assert({ id: "bot-1", name: "Marina", function: { outcome: "Contratos" }, projectId: null, workingDirectoryOverride: null })).toEqual({
      id: "bot-1",
      name: "Marina",
      function: { outcome: "Contratos" },
      projectId: null,
      workingDirectoryOverride: null,
    })
    expect(() => botSchemas.updateInput.assert({ id: "bot-1", name: "", function: input.function, projectId: null, workingDirectoryOverride: null })).toThrow()
  })

  test("accepts a member creation input that names its Leader instead of a Project", () => {
    expect(botSchemas.createInput.assert({ ...input, leaderBotId: "bot-1" })).toEqual({ ...input, leaderBotId: "bot-1" })
    expect(() => botSchemas.createInput.assert({ ...input, role: "leader" })).toThrow()
    expect(() => botSchemas.createInput.assert({ ...input, leaderBotId: "bot-1", projectId: "project-1" })).toThrow()
  })
})
