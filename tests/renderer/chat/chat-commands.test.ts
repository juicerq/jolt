import { expect, test } from "bun:test"
import { completeChatCommand, parseChatCommand, suggestChatCommands } from "@src/renderer/src/chat/chat-commands"
import type { ChatCommand } from "@src/renderer/src/chat/chat-commands"

const enabled = { memoryEnabled: true }

test("/ offers every available Comando", () => {
  expect(suggestChatCommands("/", enabled)).toEqual([
    { command: "compactar", detail: "Resume o Contexto do Bot com instruções opcionais" },
    { command: "lembrar", detail: "Guarda uma Lembrança na Memória do Bot" },
  ])
})

test.each(["/l", "/LEM", "/lembrar"])("%s offers /lembrar while the Comando word is being typed", (content) => {
  expect(suggestChatCommands(content, enabled)).toEqual([{ command: "lembrar", detail: "Guarda uma Lembrança na Memória do Bot" }])
})

test.each(["/c", "/COM", "/compactar"])("%s offers /compactar while the Comando word is being typed", (content) => {
  expect(suggestChatCommands(content, enabled)).toEqual([{ command: "compactar", detail: "Resume o Contexto do Bot com instruções opcionais" }])
})

test.each(["/lembrar ", "/lembrar algo", "/compactar ", "/compactar preserve X", "olá", "/x", "/lembrar\n"])("%s shows no menu", (content) => {
  expect(suggestChatCommands(content, enabled)).toEqual([])
})

test("the menu is absent when the Bot's Memória is off", () => {
  expect(suggestChatCommands("/", { memoryEnabled: false })).toEqual([{ command: "compactar", detail: "Resume o Contexto do Bot com instruções opcionais" }])
})

test("completing a suggestion writes the Comando and one space", () => {
  expect(completeChatCommand({ command: "lembrar", detail: "" })).toBe("/lembrar ")
})

test.each<[string, string]>([
  ["/lembrar  Prefere respostas curtas ", "Prefere respostas curtas"],
  ["/lembrar", ""],
  ["/lembrar ", ""],
  ["/LEMBRAR duas\nlinhas", "duas\nlinhas"],
])("%s parses as a /lembrar Comando", (content, remembered) => {
  expect(parseChatCommand(content, enabled)).toEqual({ command: "lembrar", content: remembered })
})

test.each<[string, ChatCommand]>([
  ["/compactar", { command: "compactar" }],
  ["/compactar ", { command: "compactar" }],
  ["/COMPACTAR  preserve decisões e\ntarefas pendentes ", { command: "compactar", instructions: "preserve decisões e\ntarefas pendentes" }],
])("%s parses as a /compactar Comando", (content, command) => {
  expect(parseChatCommand(content, enabled)).toEqual(command)
})

test.each(["olá", "/lem", "/lembrarx algo", " /lembrar algo"])("%s is not a Comando", (content) => {
  expect(parseChatCommand(content, enabled)).toBeNull()
})

test("a Comando is plain text when the Bot's Memória is off", () => {
  expect(parseChatCommand("/lembrar algo", { memoryEnabled: false })).toBeNull()
  expect(parseChatCommand("/compactar preserve X", { memoryEnabled: false })).toEqual({ command: "compactar", instructions: "preserve X" })
})
