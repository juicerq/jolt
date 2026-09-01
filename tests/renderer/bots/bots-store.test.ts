import { beforeEach, describe, expect, test } from "bun:test"
import { botsStore, discardDraft, openCreateBot, selectBot } from "@src/renderer/src/bots/bots-store"

describe("Bot draft", () => {
  beforeEach(() => {
    botsStore.setState(() => ({ selectedBotId: null, draft: false, dialog: null }))
  })

  test("creating a Bot opens a draft over the selected Bot without losing it", () => {
    selectBot("revisor")
    openCreateBot()

    expect(botsStore.state).toEqual({ selectedBotId: "revisor", draft: true, dialog: null })
  })

  test("discarding the draft returns to the selected Bot", () => {
    selectBot("revisor")
    openCreateBot()
    discardDraft()

    expect(botsStore.state).toEqual({ selectedBotId: "revisor", draft: false, dialog: null })
  })

  test("selecting a Bot drops the draft", () => {
    openCreateBot()
    selectBot("revisor")

    expect(botsStore.state).toEqual({ selectedBotId: "revisor", draft: false, dialog: null })
  })
})
