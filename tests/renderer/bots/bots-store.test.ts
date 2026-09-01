import { beforeEach, describe, expect, test } from "bun:test"
import { botsStore, discardDraft, nameDraft, openCreateBot, selectBot } from "@src/renderer/src/bots/bots-store"

describe("Bot draft", () => {
  beforeEach(() => {
    botsStore.setState(() => ({ selectedBotId: null, draft: null, dialog: null }))
  })

  test("creating a Bot opens an unnamed draft over the selected Bot without losing it", () => {
    selectBot("revisor")
    openCreateBot()

    expect(botsStore.state).toEqual({ selectedBotId: "revisor", draft: { name: "" }, dialog: null })
  })

  test("naming the draft keeps the name for the sidebar", () => {
    openCreateBot()
    nameDraft("Testador")

    expect(botsStore.state.draft).toEqual({ name: "Testador" })
  })

  test("creating a Bot again keeps the draft in progress", () => {
    openCreateBot()
    nameDraft("Testador")
    openCreateBot()

    expect(botsStore.state.draft).toEqual({ name: "Testador" })
  })

  test("discarding the draft returns to the selected Bot", () => {
    selectBot("revisor")
    openCreateBot()
    discardDraft()

    expect(botsStore.state).toEqual({ selectedBotId: "revisor", draft: null, dialog: null })
  })

  test("selecting a Bot drops the draft", () => {
    openCreateBot()
    selectBot("revisor")

    expect(botsStore.state).toEqual({ selectedBotId: "revisor", draft: null, dialog: null })
  })
})
