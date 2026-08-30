import { describe, expect, test } from "bun:test"
import { teamSchemas } from "@src/shared/teams"

describe("team boundary", () => {
  test("accepts the complete team and leader input", () => {
    const input = {
      name: "Vendas",
      objective: "Transformar interesse em contratos assinados",
      defaultProvider: "codex" as const,
      leader: {
        name: "Líder de vendas",
        function: {
          outcome: "Contratos prontos para assinatura",
          responsibilities: "Distribuir contatos e revisar propostas",
          limits: "Não altera preços sem ordem direta",
          delivery: "Resumo com proposta e próximos passos",
        },
      },
    }

    expect(teamSchemas.createInput.assert(input)).toEqual(input)
  })

  test("rejects fields outside the creation contract", () => {
    expect(() => teamSchemas.createInput.assert({
      name: "Vendas",
      objective: "Converter oportunidades",
      defaultProvider: "codex",
      leader: {
        name: "Líder",
        function: {
          outcome: "Contrato",
          responsibilities: "Negociar",
          limits: "Sem descontos",
          delivery: "Proposta",
        },
      },
      apiKey: "secret",
    })).toThrow()
  })
})
