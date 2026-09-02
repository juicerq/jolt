import { expect, test } from "bun:test"
import { completeChatCommand, suggestChatCommands } from "@src/renderer/src/chat/chat-commands"

test.each(["/", "/l", "/LEM", "/lembrar"])("%s offers Lembrar without a Lembrança yet", (content) => {
  const suggestions = suggestChatCommands(content, { memoryEnabled: true })

  expect(suggestions).toEqual([{ command: "lembrar", label: "/lembrar", detail: "Escreva a Lembrança depois do comando", content: null }])
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

test.each([
  ["/lem", "/lembrar "],
  ["/lembrar", "/lembrar "],
  ["/lem Prefere respostas curtas", "/lembrar Prefere respostas curtas"],
])("Tab completes %s to %s", (content, completed) => {
  const [suggestion] = suggestChatCommands(content, { memoryEnabled: true })

  expect(completeChatCommand(suggestion!)).toBe(completed)
})
