import { beforeEach, describe, expect, test } from "bun:test"
import { botsStore, closeWorkspaceScreen, discardDraft, forgetBot, openCreateBot, openCreateTeamBot, openPlugins, openSettings, selectBot, toggleBrowserSidebar, openMobileMenu } from "@src/renderer/src/bots/bots-store"

import { botRouteActions } from "@src/renderer/src/bots/bot-route-actions"

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

  test.each([
    { id: "leader", leaderBotId: null },
    { id: "member", leaderBotId: "leader" },
  ])("creating a team Bot from $id opens its leader's member form", (bot) => {
    selectBot("unrelated")
    openCreateBot()
    openSettings()
    openCreateTeamBot(bot)
    expect(botsStore.state).toMatchObject({ selectedBotId: "leader", botRoute: { name: "members", create: true }, draft: null, screen: null, mobileList: false })
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

test("Bot navigation offers only supported pages and preserves edge-tab toggling", () => {
  const independent = botRouteActions({ leaderBotId: null, temporary: false }, { name: "chat" })
  expect(independent.map((action) => action.name)).toEqual(["chat", "settings", "members", "routines", "triggers", "archive", "memory"])
  const temporary = botRouteActions({ leaderBotId: "leader", temporary: true }, { name: "chat" })
  expect(temporary.map((action) => action.name)).toEqual(["chat", "settings", "archive", "memory"])
  const permanent = botRouteActions({ leaderBotId: "leader", temporary: false }, { name: "routine", id: "existing" })
  expect(permanent.some((action) => action.name === "members")).toBeFalse()
  permanent.find((action) => action.name === "routines")?.select()
  expect(botsStore.state.botRoute).toEqual({ name: "routines" })
  botRouteActions({ leaderBotId: null, temporary: false }, { name: "routines" }).find((action) => action.name === "routines")?.select()
  expect(botsStore.state.botRoute).toEqual({ name: "chat" })
  botRouteActions({ leaderBotId: null, temporary: false }, { name: "chat" }).find((action) => action.name === "archive")?.select()
  expect(botsStore.state.botRoute).toEqual({ name: "archive" })
  botRouteActions({ leaderBotId: null, temporary: false }, { name: "archive" }).find((action) => action.name === "archive")?.select()
  expect(botsStore.state.botRoute).toEqual({ name: "chat" })
  botsStore.setState(() => initialState)
})
