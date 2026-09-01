import { describe, expect, test } from "bun:test"
import type { Bot } from "@src/shared/bots"
import { describeMember, groupMembers } from "@src/renderer/src/bots/member-groups"

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
    [tradutor, "Encerrado · Revisão pronta"],
  ])("describes $name by its tenure", (bot, description) => {
    expect(describeMember(bot)).toBe(description)
  })
})
