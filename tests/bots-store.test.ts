import { beforeEach, describe, expect, test } from "bun:test"
import { botsStore, closeWorkspaceScreen, discardDraft, forgetBot, openBotList, openCreateBot, openPlugins, openSettings, selectBot } from "@src/renderer/src/bots/bots-store"

const initialState = { ...botsStore.state }

describe("mobile navigation between the Bot list and the conversation plane", () => {
  beforeEach(() => {
    botsStore.setState(() => initialState)
  })

  test("starts on the list and leaves it when a Bot, a screen or a draft opens", () => {
    expect(botsStore.state.listOpen).toBe(true)

    selectBot("bot-1")
    expect(botsStore.state.listOpen).toBe(false)

    openBotList()
    expect(botsStore.state.listOpen).toBe(true)

    openSettings()
    expect(botsStore.state.listOpen).toBe(false)

    openBotList()
    openPlugins()
    expect(botsStore.state.listOpen).toBe(false)

    openBotList()
    openCreateBot()
    expect(botsStore.state.listOpen).toBe(false)
  })

  test("closing a screen or a draft returns to the list", () => {
    openSettings()
    closeWorkspaceScreen()
    expect(botsStore.state).toMatchObject({ screen: null, listOpen: true })

    openCreateBot()
    discardDraft()
    expect(botsStore.state).toMatchObject({ draft: null, listOpen: true })
  })

  test("removing the selected Bot returns to the list; removing another Bot does not", () => {
    selectBot("bot-1")
    forgetBot("bot-2")
    expect(botsStore.state).toMatchObject({ selectedBotId: "bot-1", listOpen: false })

    forgetBot("bot-1")
    expect(botsStore.state).toMatchObject({ selectedBotId: null, listOpen: true })
  })
})
