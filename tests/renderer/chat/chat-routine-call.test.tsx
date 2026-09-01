import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { ChatRoutineCall } from "@src/renderer/src/chat/chat-routine-call"

describe("ChatRoutineCall", () => {
  test("names the Rotina as the author and keeps the Chamada text", () => {
    const markup = renderToStaticMarkup(<ChatRoutineCall botName="Correio" time="09:00" content="Verifique a caixa de entrada" />)

    expect(markup).toContain("Uma Rotina chamou Correio")
    expect(markup).toContain("Verifique a caixa de entrada")
    expect(markup).toContain(">Rotina<")
  })
})
