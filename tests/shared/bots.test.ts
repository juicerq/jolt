import { describe, expect, test } from "bun:test"
import { botSchemas } from "@src/shared/bots"

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

describe("bot boundary", () => {
  test("accepts a standalone bot creation input", () => {
    expect(botSchemas.createInput.assert(input)).toEqual(input)
  })

  test("rejects a role or leader supplied during creation", () => {
    expect(() => botSchemas.createInput.assert({ ...input, role: "leader" })).toThrow()
    expect(() => botSchemas.createInput.assert({ ...input, leaderBotId: "bot-1" })).toThrow()
  })
})
