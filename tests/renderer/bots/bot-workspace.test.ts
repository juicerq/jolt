import { describe, expect, test } from "bun:test"
import { workspaceInput } from "@src/renderer/src/bots/bot-workspace"

describe("Vínculo", () => {
  test.each([
    ["", {}],
    ["project:jolt", { projectId: "jolt" }],
    ["leader:marina", { leaderBotId: "marina" }],
  ])("maps the choice %p to the creation input", (choice, input) => {
    expect(workspaceInput(choice)).toEqual(input)
  })
})
