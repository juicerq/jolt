import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { ChatMemberResult, memberResultKind } from "@src/renderer/src/chat/chat-member-result"

describe("ChatMemberResult", () => {
  test("shows the member name and the Resultado label collapsed", () => {
    const markup = renderToStaticMarkup(<ChatMemberResult name="Calo" status="done" time="22:35" content="São Paulo: 21 °C" />)

    expect(markup.match(/<summary/g)).toHaveLength(1)
    expect(markup).not.toMatch(/<details[^>]*\sopen/)
    expect(markup).toContain("Calo")
    expect(markup).toContain("Calo retornou")
    expect(markup).toContain("São Paulo: 21 °C")
  })

  test.each([
    ["interrupted"],
    ["failed"],
  ] as const)("labels a %s Tarefa as not concluded", (status) => {
    const markup = renderToStaticMarkup(<ChatMemberResult name="Lia" status={status} time="22:35" content="Lia failed before finishing." />)

    expect(markup).toContain("Lia não concluiu a Tarefa")
    expect(markup).not.toContain("Resultado")
  })

  test("opens while the result is arriving", () => {
    const markup = renderToStaticMarkup(<ChatMemberResult name="Calo" status="done" time="Agora" content="Chegando" open />)

    expect(markup).toMatch(/<details[^>]*\sopen/)
  })
})

describe("memberResultKind", () => {
  test("a message in the assignee's conversation is the Tarefa; anywhere else it is the result", () => {
    const task = { assigneeBotId: "emailer" }

    expect(memberResultKind("emailer", task)).toBe("assignment")
    expect(memberResultKind("atlas", task)).toBe("result")
    expect(memberResultKind("atlas", undefined)).toBe("result")
  })
})

describe("ChatMemberResult assignment", () => {
  test("labels a message from the Líder as a delegated Tarefa regardless of status", () => {
    const markup = renderToStaticMarkup(<ChatMemberResult kind="assignment" name="Marina" status="failed" time="22:35" content="Consulte o clima de São Paulo" />)

    expect(markup).toContain("Marina delegou uma Tarefa")
    expect(markup).not.toContain("retornou")
    expect(markup).not.toContain("não concluiu")
    expect(markup).toContain("Consulte o clima de São Paulo")
  })
})
