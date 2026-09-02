import { expect, test } from "bun:test"
import { completeChatCommand, parseChatCommand, suggestChatCommands } from "@src/renderer/src/chat/chat-commands"

const enabled = { memoryEnabled: true }

test.each(["/", "/l", "/LEM", "/lembrar"])("%s offers /lembrar while the Comando word is being typed", (content) => {
  expect(suggestChatCommands(content, enabled)).toEqual([{ command: "lembrar", detail: "Guarda uma Lembrança na Memória do Bot" }])
})

test.each(["/lembrar ", "/lembrar algo", "olá", "/x", "/lembrar\n"])("%s shows no menu", (content) => {
  expect(suggestChatCommands(content, enabled)).toEqual([])
})

test("the menu is absent when the Bot's Memória is off", () => {
  expect(suggestChatCommands("/lem", { memoryEnabled: false })).toEqual([])
})

test("completing a suggestion writes the Comando and one space", () => {
  expect(completeChatCommand({ command: "lembrar", detail: "" })).toBe("/lembrar ")
})

test.each([
  ["/lembrar  Prefere respostas curtas ", "Prefere respostas curtas"],
  ["/lembrar", ""],
  ["/lembrar ", ""],
  ["/LEMBRAR duas\nlinhas", "duas\nlinhas"],
])("%s parses as a /lembrar Comando", (content, remembered) => {
  expect(parseChatCommand(content, enabled)).toEqual({ command: "lembrar", content: remembered })
})

test.each(["olá", "/lem", "/lembrarx algo", " /lembrar algo"])("%s is not a Comando", (content) => {
  expect(parseChatCommand(content, enabled)).toBeNull()
})

test("a Comando is plain text when the Bot's Memória is off", () => {
  expect(parseChatCommand("/lembrar algo", { memoryEnabled: false })).toBeNull()
})
