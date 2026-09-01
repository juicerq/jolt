import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { ChatTurnEnding } from "@src/renderer/src/chat/chat-turn-ending"

describe("ChatTurnEnding", () => {
  test.each([
    ["aborted", "Você interrompeu Marina"],
    ["failed", "Marina parou por um erro"],
    ["closed", "O app fechou durante a resposta de Marina"],
  ] as const)("explains a %s turn to the person", (ending, label) => {
    const markup = renderToStaticMarkup(<ChatTurnEnding botName="Marina" ending={ending} />)

    expect(markup).toContain(label)
  })
})
