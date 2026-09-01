import { describe, expect, test } from "bun:test"
import type { Bot } from "@src/shared/bots"
import { describeMember, groupMembers, highlightedBotId } from "@src/renderer/src/bots/member-groups"

const base = { leaderBotId: "marina", projectId: null, provider: "codex" as const, function: { outcome: "Revisão pronta", responsibilities: "Revisar", limits: "Nada", delivery: "Texto" }, workingDirectoryOverride: null, effectiveWorkingDirectory: "/tmp/jolt", createdAt: "2026-09-01T10:00:00.000Z" }
const lia: Bot = { ...base, id: "lia", name: "Lia", temporary: false, closed: false }
const revisor: Bot = { ...base, id: "revisor", name: "Revisor", temporary: true, closed: false }
const tradutor: Bot = { ...base, id: "tradutor", name: "Tradutor", temporary: true, closed: true }

describe("member groups", () => {
  test("separates permanent, active temporary, and closed temporary members", () => {
    expect(groupMembers([tradutor, revisor, lia])).toEqual({ permanent: [lia], active: [revisor], closed: [tradutor] })
  })

  test.each([
    [lia, "Revisão pronta"],
    [revisor, "Temporário · Revisão pronta"],
    [tradutor, "Revisão pronta"],
  ])("describes $name by its tenure", (bot, description) => {
    expect(describeMember(bot)).toBe(description)
  })
})

describe("highlighted row", () => {
  const marina: Bot = { ...base, id: "marina", name: "Marina", leaderBotId: null, temporary: false, closed: false }
  const team = { ...marina, members: [lia, tradutor] }

  test("moves the selection to the Líder while the Time is collapsed and a member is selected", () => {
    expect(highlightedBotId(team, "lia", false)).toBe("marina")
    expect(highlightedBotId(team, "tradutor", false)).toBe("marina")
  })

  test("keeps the selection on the member while the Time is expanded", () => {
    expect(highlightedBotId(team, "lia", true)).toBe("lia")
  })

  test("leaves a selection outside the Time alone", () => {
    expect(highlightedBotId(team, "nina", false)).toBe("nina")
    expect(highlightedBotId(team, null, false)).toBeNull()
  })
})
