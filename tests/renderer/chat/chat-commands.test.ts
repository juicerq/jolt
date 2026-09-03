import { expect, test } from "bun:test"
import { buildChatCommand, startedChatCommand, suggestChatCommands } from "@src/renderer/src/chat/chat-commands"
import type { ChatCommand, ChatCommandName } from "@src/renderer/src/chat/chat-commands"

const enabled = { memoryEnabled: true }

test("/ offers every available Comando", () => {
  expect(suggestChatCommands("/", enabled)).toEqual([
    { command: "compactar", detail: "Resume o Contexto do Bot com instruções opcionais" },
    { command: "lembrar", detail: "Guarda uma Lembrança na Memória do Bot" },
  ])
})

test.each(["/l", "/LEM", "/lembrar"])("%s offers lembrar while the Comando word is being typed", (content) => {
  expect(suggestChatCommands(content, enabled)).toEqual([{ command: "lembrar", detail: "Guarda uma Lembrança na Memória do Bot" }])
})

test.each(["/c", "/COM", "/compactar"])("%s offers compactar while the Comando word is being typed", (content) => {
  expect(suggestChatCommands(content, enabled)).toEqual([{ command: "compactar", detail: "Resume o Contexto do Bot com instruções opcionais" }])
})

test.each(["/lembrar ", "/lembrar algo", "/compactar ", "/compactar preserve X", "olá", "/x", "/lembrar\n"])("%s shows no menu", (content) => {
  expect(suggestChatCommands(content, enabled)).toEqual([])
})

test("the menu is absent when the Bot's Memória is off", () => {
  expect(suggestChatCommands("/", { memoryEnabled: false })).toEqual([{ command: "compactar", detail: "Resume o Contexto do Bot com instruções opcionais" }])
})

test.each<[string, { command: ChatCommandName; content: string }]>([
  ["/lembrar ", { command: "lembrar", content: "" }],
  ["/lembrar Prefere respostas curtas", { command: "lembrar", content: "Prefere respostas curtas" }],
  ["/COMPACTAR  preserve decisões", { command: "compactar", content: " preserve decisões" }],
  ["/compactar\nduas linhas", { command: "compactar", content: "duas linhas" }],
])("%s starts a Comando and keeps the rest as the draft text", (content, started) => {
  expect(startedChatCommand(content, enabled)).toEqual(started)
})

test.each(["/lembrar", "/compactar", "olá", "/lem algo", "/lembrarx algo", " /lembrar algo"])("%s starts no Comando", (content) => {
  expect(startedChatCommand(content, enabled)).toBeNull()
})

test("a Comando does not start when the Bot's Memória is off", () => {
  expect(startedChatCommand("/lembrar algo", { memoryEnabled: false })).toBeNull()
  expect(startedChatCommand("/compactar algo", { memoryEnabled: false })).toEqual({ command: "compactar", content: "algo" })
})

test.each<[string, ChatCommand]>([
  ["", { command: "compactar" }],
  ["   ", { command: "compactar" }],
  ["  preserve decisões e\ntarefas pendentes ", { command: "compactar", instructions: "preserve decisões e\ntarefas pendentes" }],
])("compactar with %p builds a Comando", (content, command) => {
  expect(buildChatCommand("compactar", content, enabled)).toEqual(command)
})

test.each<[string, ChatCommand]>([
  [" Prefere respostas curtas ", { command: "lembrar", content: "Prefere respostas curtas" }],
  ["duas\nlinhas", { command: "lembrar", content: "duas\nlinhas" }],
])("lembrar with %p builds a Comando", (content, command) => {
  expect(buildChatCommand("lembrar", content, enabled)).toEqual(command)
})

test.each(["", "   "])("lembrar with %p has nothing to run", (content) => {
  expect(buildChatCommand("lembrar", content, enabled)).toBeNull()
})

test("lembrar has nothing to run when the Bot's Memória is off", () => {
  expect(buildChatCommand("lembrar", "algo", { memoryEnabled: false })).toBeNull()
})
