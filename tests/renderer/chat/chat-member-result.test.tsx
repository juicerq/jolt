import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { ChatMemberResult } from "@src/renderer/src/chat/chat-member-result"

describe("ChatMemberResult", () => {
  test("shows the member name and the Resultado label collapsed", () => {
    const markup = renderToStaticMarkup(<ChatMemberResult name="Calo" status="done" time="22:35" content="São Paulo: 21 °C" />)

    expect(markup.match(/<summary/g)).toHaveLength(1)
    expect(markup).not.toMatch(/<details[^>]*\sopen/)
    expect(markup).toContain("Calo")
    expect(markup).toContain("Resultado")
    expect(markup).toContain("São Paulo: 21 °C")
  })

  test.each([
    ["interrupted"],
    ["failed"],
  ] as const)("labels a %s Tarefa as not concluded", (status) => {
    const markup = renderToStaticMarkup(<ChatMemberResult name="Lia" status={status} time="22:35" content="Lia failed before finishing." />)

    expect(markup).toContain("Tarefa não concluída")
    expect(markup).not.toContain("Resultado")
  })

  test("opens while the result is arriving", () => {
    const markup = renderToStaticMarkup(<ChatMemberResult name="Calo" status="done" time="Agora" content="Chegando" open />)

    expect(markup).toMatch(/<details[^>]*\sopen/)
  })
})
