import { expect, test } from "bun:test"
import { suggestChatCommands } from "@src/renderer/src/chat/chat-commands"

test.each(["/", "/l", "/LEM", "/lembrar"])("%s offers Lembrar without a Lembrança yet", (content) => {
  const suggestions = suggestChatCommands(content, { memoryEnabled: true })

  expect(suggestions).toEqual([{ command: "lembrar", label: "Lembrar", detail: "Escreva a Lembrança depois de /lembrar", content: null }])
})

test("/lembrar carries the rest of the line as the Lembrança", () => {
  const [suggestion] = suggestChatCommands("/lembrar  Prefere respostas curtas ", { memoryEnabled: true })

  expect(suggestion?.content).toBe("Prefere respostas curtas")
  expect(suggestion?.detail).toBe("Prefere respostas curtas")
})

test("Lembrar is absent when the Bot's Memória is off", () => {
  expect(suggestChatCommands("/lem", { memoryEnabled: false })).toEqual([])
})

test.each(["olá", "/x", "/modelo", "/lembrar\nalgo"])("%s is not a Comando", (content) => {
  expect(suggestChatCommands(content, { memoryEnabled: true })).toEqual([])
})
