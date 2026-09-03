import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { describeOrigin, MemoryList } from "@src/renderer/src/bots/bot-memory"
import type { Memory } from "@src/shared/memory"

const createdAt = "2026-09-01T12:00:00.000Z"

function memory(fields: Partial<Memory>): Memory {
  return { id: "m1", botId: "b1", content: "Entrega relatórios em PDF", origin: "bot", turnAuthor: "person", createdAt, ...fields }
}

describe("BotMemory", () => {
  test.each([
    [memory({ origin: "person", turnAuthor: null }), "Você adicionou · 01/09/2026"],
    [memory({ turnAuthor: "person" }), "Aprendeu com você · 01/09/2026"],
    [memory({ turnAuthor: "routine" }), "Aprendeu em uma Rotina · 01/09/2026"],
    [memory({ turnAuthor: "bot" }), "Aprendeu com outro Bot · 01/09/2026"],
    [memory({ turnAuthor: null }), "Aprendeu com outro Bot · 01/09/2026"],
  ])("describes the Origem of %p", (entry, expected) => {
    expect(describeOrigin(entry)).toBe(expected)
  })

  test("lists each Lembrança with its Origem and a forget action", () => {
    const markup = renderToStaticMarkup(<MemoryList memories={[memory({}), memory({ id: "m2", content: "Prefere respostas curtas", origin: "person", turnAuthor: null })]} busy={false} onEdit={() => {}} onForget={() => {}} />)

    expect(markup).toContain("Entrega relatórios em PDF")
    expect(markup).toContain("Aprendeu com você · 01/09/2026")
    expect(markup).toContain("Prefere respostas curtas")
    expect(markup).toContain("Você adicionou · 01/09/2026")
    expect(markup.split('aria-label="Editar Lembrança"')).toHaveLength(3)
    expect(markup.split('aria-label="Esquecer Lembrança"')).toHaveLength(3)
  })

  test("a Memória do Líder reads without actions and an empty Memória says so", () => {
    expect(renderToStaticMarkup(<MemoryList memories={[memory({})]} busy={false} />)).not.toContain("Esquecer Lembrança")
    expect(renderToStaticMarkup(<MemoryList memories={[memory({})]} busy={false} />)).not.toContain("Editar Lembrança")
    expect(renderToStaticMarkup(<MemoryList memories={[]} busy={false} />)).toContain("Nenhuma Lembrança ainda.")
  })
})
