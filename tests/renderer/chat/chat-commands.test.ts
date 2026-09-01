import { expect, test } from "bun:test"
import { suggestChatCommands } from "@src/renderer/src/chat/chat-commands"

const catalog = { default: "gpt-5.6-luna", models: [{ id: "gpt-5.6-luna", name: "GPT-5.6 Luna" }, { id: "gpt-5.6-sol", name: "GPT-5.6 Sol" }] }

test("a lone slash lists every Modelo, every Esforço and Lembrar", () => {
  const suggestions = suggestChatCommands("/", { catalog, memoryEnabled: true })

  expect(suggestions.map((suggestion) => suggestion.command)).toEqual(["modelo", "modelo", "esforco", "esforco", "esforco", "esforco", "esforco", "lembrar"])
  expect(suggestions.find((suggestion) => suggestion.label === "GPT-5.6 Luna")?.standard).toBe(true)
  expect(suggestions.find((suggestion) => suggestion.command === "lembrar")?.action).toBeNull()
})

test.each([
  ["/mod", ["GPT-5.6 Luna", "GPT-5.6 Sol"]],
  ["/modelo sol", ["GPT-5.6 Sol"]],
  ["/esforço muito", ["muito alto"]],
  ["/esforco MAX", ["máximo"]],
  ["/x", []],
])("%s narrows the suggestions", (content, labels) => {
  const suggestions = suggestChatCommands(content, { catalog, memoryEnabled: true })

  expect(suggestions.map((suggestion) => suggestion.label)).toEqual(labels)
})

test("/lembrar carries the rest of the line as the Lembrança", () => {
  const [suggestion] = suggestChatCommands("/lembrar  Prefere respostas curtas ", { catalog, memoryEnabled: true })

  expect(suggestion?.action).toEqual({ kind: "remember", content: "Prefere respostas curtas" })
  expect(suggestion?.detail).toBe("Prefere respostas curtas")
})

test("Lembrar is absent when the Bot's Memória is off", () => {
  const suggestions = suggestChatCommands("/lem", { catalog, memoryEnabled: false })

  expect(suggestions).toEqual([])
})

test("plain text and multi-line drafts are not commands", () => {
  expect(suggestChatCommands("olá", { catalog, memoryEnabled: true })).toEqual([])
  expect(suggestChatCommands("/modelo\nsol", { catalog, memoryEnabled: true })).toEqual([])
})
