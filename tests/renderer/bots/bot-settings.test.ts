import { describe, expect, test } from "bun:test"
import { draftOf, settingsChange } from "@src/renderer/src/bots/bot-settings"
import type { Bot } from "@src/shared/bots"

const bot: Bot = { id: "b1", leaderBotId: null, projectId: null, name: "Testador", provider: "codex", function: { outcome: "Testes passando" }, workingDirectoryOverride: null, temporary: false, memoryEnabled: true, createdAt: "2026-09-01T12:00:00.000Z", effectiveWorkingDirectory: "/tmp/b1", closed: false }

describe("Bot settings", () => {
  test("a draft equal to the Bot has no change, even with spare spaces", () => {
    expect(settingsChange(bot, draftOf(bot))).toBeUndefined()
    expect(settingsChange(bot, { ...draftOf(bot), name: "  Testador ", outcome: "Testes passando  " })).toBeUndefined()
  })

  test("a change trims the text and maps empty choices to null", () => {
    expect(settingsChange(bot, { ...draftOf(bot), name: " Revisor ", description: "  " })).toEqual({
      complete: true,
      input: { id: "b1", name: "Revisor", function: { outcome: "Testes passando" }, projectId: null, workingDirectoryOverride: null, memoryEnabled: true },
    })
    expect(settingsChange(bot, { ...draftOf(bot), description: "Cobre tudo", projectId: "p1", workingDirectoryOverride: "/work" })?.input).toMatchObject({
      function: { outcome: "Testes passando", description: "Cobre tudo" },
      projectId: "p1",
      workingDirectoryOverride: "/work",
    })
  })

  test("a draft without name or outcome changes but cannot be saved", () => {
    expect(settingsChange(bot, { ...draftOf(bot), name: " " })?.complete).toBe(false)
    expect(settingsChange(bot, { ...draftOf(bot), outcome: "" })?.complete).toBe(false)
  })
})
