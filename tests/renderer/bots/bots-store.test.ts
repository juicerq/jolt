import { beforeEach, describe, expect, test } from "bun:test"
import { botDraftAvatarSeed, botsStore, discardDraft, forgetBot, nameDraft, openCreateBot, regenerateDraftAvatar, selectBot } from "@src/renderer/src/bots/bots-store"

describe("Bot draft", () => {
  beforeEach(() => {
    botsStore.setState(() => ({ selectedBotId: null, draft: null, dialog: null, screen: null }))
  })

  test("creating a Bot opens an unnamed draft over the selected Bot without losing it", () => {
    selectBot("revisor")
    openCreateBot()

    expect(botsStore.state.selectedBotId).toBe("revisor")
    expect(botsStore.state.draft?.name).toBe("")
    expect(botsStore.state.draft?.avatarSeed).toBeNull()
  })

  test("naming the draft keeps the name for the sidebar", () => {
    openCreateBot()
    nameDraft("Testador")

    expect(botsStore.state.draft?.name).toBe("Testador")
  })

  test("the default avatar follows the Bot name", () => {
    openCreateBot()
    nameDraft("Testador")

    expect(botDraftAvatarSeed(botsStore.state.draft!)).toBe("jolt:new:Testador")
  })

  test("creating a Bot again keeps the draft in progress", () => {
    openCreateBot()
    nameDraft("Testador")
    const avatarSeed = botsStore.state.draft!.avatarSeed
    openCreateBot()

    expect(botsStore.state.draft).toEqual({ avatarSeed, name: "Testador" })
  })

  test("generating another avatar keeps the draft and changes its stable seed", () => {
    openCreateBot()
    nameDraft("Testador")
    const firstSeed = botDraftAvatarSeed(botsStore.state.draft!)

    regenerateDraftAvatar()

    expect(botsStore.state.draft?.name).toBe("Testador")
    expect(botDraftAvatarSeed(botsStore.state.draft!)).not.toBe(firstSeed)
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
