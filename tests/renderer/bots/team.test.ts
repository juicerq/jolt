import { describe, expect, test } from "bun:test"
import { findTeamBot, teamNames, teamOf } from "@src/renderer/src/bots/team"
import type { ProjectGroups } from "@src/shared/projects"
import type { Bot } from "@src/shared/bots"

function bot(id: string, name: string, leaderBotId: string | null = null, closed = false): Bot {
  return { id, leaderBotId, projectId: null, name, provider: "codex", function: { outcome: `Entregar ${name}` }, workingDirectoryOverride: null, temporary: false, memoryEnabled: true, effort: "medium", model: null, permissionMode: "ask", createdAt: "2026-09-01T12:00:00.000Z", effectiveWorkingDirectory: `/tmp/${id}`, closed }
}

const groups: ProjectGroups = {
  projects: [{ id: "p1", name: "Loja", defaultWorkingDirectory: "/tmp/loja", createdAt: "2026-09-01T12:00:00.000Z", bots: [{ ...bot("l1", "Coordenador"), members: [bot("m1", "Pesquisador", "l1"), bot("m2", "Redator", "l1", true)] }] }],
  unassignedBots: [{ ...bot("u1", "Leve"), members: [] }],
}

describe("Team", () => {
  test("finds leaders, members and unassigned Bots by id", () => {
    expect(findTeamBot(groups, "l1")?.name).toBe("Coordenador")
    expect(findTeamBot(groups, "m2")?.name).toBe("Redator")
    expect(findTeamBot(groups, "u1")?.name).toBe("Leve")
    expect(findTeamBot(groups, "missing")).toBeUndefined()
    expect(findTeamBot(undefined, "l1")).toBeUndefined()
  })

  test("names every Bot of the team", () => {
    expect(teamNames(groups)).toEqual({ l1: "Coordenador", m1: "Pesquisador", m2: "Redator", u1: "Leve" })
    expect(teamNames(undefined)).toEqual({})
  })

  test("a team has the leader and only the open members", () => {
    expect(teamOf(groups, { id: "m1", leaderBotId: "l1" }).leader?.name).toBe("Coordenador")
    expect(teamOf(groups, { id: "l1", leaderBotId: null }).members.map((member) => member.name)).toEqual(["Pesquisador"])
  })
})
