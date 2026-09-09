import { afterEach, expect, test } from "bun:test"
import { botOrderStore, orderedBots, saveBotOrder } from "@src/renderer/src/bots/bot-order"

const initial = botOrderStore.state

afterEach(() => botOrderStore.setState(() => initial))

test("new Bots follow the saved order without mutating the server list", () => {
  const bots = [{ id: "a" }, { id: "new" }, { id: "b" }]

  expect(orderedBots(bots, ["removed", "b", "a"]).map((bot) => bot.id)).toEqual(["b", "a", "new"])
  expect(bots.map((bot) => bot.id)).toEqual(["a", "new", "b"])
})

test("reordering a filtered list preserves hidden slots and other groups", () => {
  botOrderStore.setState(() => ({ project: ["a", "hidden", "b", "c"], team: ["member"] }))
  saveBotOrder("project", ["c", "a", "b"])

  expect(botOrderStore.state).toEqual({ project: ["c", "hidden", "a", "b"], team: ["member"] })
})

test("a new member can be placed before existing members without duplicating IDs", () => {
  botOrderStore.setState(() => ({ team: ["a", "b"] }))
  saveBotOrder("team", ["new", "b", "a"])
  saveBotOrder("team", ["a", "new", "b"])

  expect(botOrderStore.state.team).toEqual(["a", "new", "b"])
})

test("an unavailable device store still keeps the order for the session", () => {
  expect(saveBotOrder("session", ["b", "a"])).toBe(false)
  expect(orderedBots([{ id: "a" }, { id: "b" }], botOrderStore.state.session)).toEqual([{ id: "b" }, { id: "a" }])
})
