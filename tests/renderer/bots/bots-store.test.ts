import { beforeEach, describe, expect, test } from "bun:test"
import { botsStore, discardDraft, forgetBot, nameDraft, openCreateBot, selectBot } from "@src/renderer/src/bots/bots-store"

describe("Bot draft", () => {
  beforeEach(() => {
    botsStore.setState(() => ({ selectedBotId: null, draft: null, dialog: null, screen: null }))
  })

  test("creating a Bot opens an unnamed draft over the selected Bot without losing it", () => {
    selectBot("revisor")
    openCreateBot()

    expect(botsStore.state).toEqual({ selectedBotId: "revisor", draft: { name: "" }, dialog: null, screen: null })
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

    expect(botsStore.state).toEqual({ selectedBotId: "revisor", draft: null, dialog: null, screen: null })
  })

  test("forgetting the selected Bot leaves no Bot selected", () => {
    selectBot("revisor")
    forgetBot("revisor")

    expect(botsStore.state.selectedBotId).toBeNull()
  })

  test("forgetting another Bot keeps the selection", () => {
    selectBot("revisor")
    forgetBot("testador")

    expect(botsStore.state.selectedBotId).toBe("revisor")
  })

  test("selecting a Bot drops the draft", () => {
    openCreateBot()
    selectBot("revisor")

    expect(botsStore.state).toEqual({ selectedBotId: "revisor", draft: null, dialog: null, screen: null })
  })
})
