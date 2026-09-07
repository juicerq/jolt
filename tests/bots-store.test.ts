import { beforeEach, describe, expect, test } from "bun:test"
import { botsStore, closeWorkspaceScreen, discardDraft, forgetBot, openCreateBot, openPlugins, openSettings, selectBot, toggleBrowserSidebar, openMobileMenu } from "@src/renderer/src/bots/bots-store"

const initialState = { ...botsStore.state }

describe("navigation between Bots, screens and the draft", () => {
  beforeEach(() => {
    botsStore.setState(() => initialState)
  })

  test("selecting a Bot closes the screen and the draft and returns to its conversation", () => {
    openSettings()
    openCreateBot()
    selectBot("bot-1")
    expect(botsStore.state).toMatchObject({ selectedBotId: "bot-1", botRoute: { name: "chat" }, screen: null, draft: null })
  })

  test("a screen replaces the draft; closing it keeps the selected Bot", () => {
    selectBot("bot-1")
    openCreateBot()
    openPlugins()
    expect(botsStore.state).toMatchObject({ screen: "plugins", draft: null })

    closeWorkspaceScreen()
    expect(botsStore.state).toMatchObject({ screen: null, selectedBotId: "bot-1" })
  })

  test("leaving a screen closes the browser sidebar", () => {
    openSettings()
    toggleBrowserSidebar()
    expect(botsStore.state.browserSidebarOpen).toBeTrue()

    closeWorkspaceScreen()
    expect(botsStore.state.browserSidebarOpen).toBeFalse()
  })

  test("mobile menu and browser panel close each other and navigation closes the menu", () => {
    toggleBrowserSidebar()
    openMobileMenu()
    expect(botsStore.state).toMatchObject({ mobileMenuOpen: true, browserSidebarOpen: false })
    toggleBrowserSidebar()
    expect(botsStore.state).toMatchObject({ mobileMenuOpen: false, browserSidebarOpen: true })
    openMobileMenu()
    selectBot("bot-1")
    expect(botsStore.state).toMatchObject({ mobileMenuOpen: false, browserSidebarOpen: false, selectedBotId: "bot-1" })
  })

  test("discarding the draft keeps the selected Bot", () => {
    selectBot("bot-1")
    openCreateBot()
    discardDraft()
    expect(botsStore.state).toMatchObject({ draft: null, selectedBotId: "bot-1" })
  })

  test("removing the selected Bot clears the selection; removing another Bot does not", () => {
    selectBot("bot-1")
    forgetBot("bot-2")
    expect(botsStore.state.selectedBotId).toBe("bot-1")

    forgetBot("bot-1")
    expect(botsStore.state.selectedBotId).toBeNull()
  })
})
