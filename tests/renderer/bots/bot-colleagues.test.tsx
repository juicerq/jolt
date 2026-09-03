import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { BotColleagueList, colleaguesOf } from "@src/renderer/src/bots/bot-colleagues"
import type { Bot } from "@src/shared/bots"
import type { ProjectGroups } from "@src/shared/projects"

function bot(id: string, name: string, colleagueIds: string[] = []): Bot {
  return { id, leaderBotId: null, projectId: null, name, provider: "codex", function: { outcome: `Entregar ${name}` }, workingDirectoryOverride: null, temporary: false, memoryEnabled: true, effort: "medium", model: null, permissionMode: "ask", createdAt: "2026-09-01T12:00:00.000Z", effectiveWorkingDirectory: `/tmp/${id}`, closed: false, colleagueIds }
}

const atlas = bot("atlas", "Atlas", ["emailer", "ghost"])
const groups: ProjectGroups = { projects: [], unassignedBots: [{ ...atlas, members: [] }, { ...bot("emailer", "Emailer"), members: [] }] }

describe("BotColleagues", () => {
  test("lists the Colegas the Bot can call, skipping ids no longer known", () => {
    expect(colleaguesOf(groups, atlas).map((colleague) => colleague.name)).toEqual(["Emailer"])

    const markup = renderToStaticMarkup(<BotColleagueList bot={atlas} colleagues={colleaguesOf(groups, atlas)} busy={false} onRevoke={() => {}} />)

    expect(markup).toContain("Emailer")
    expect(markup).toContain("Entregar Emailer")
    expect(markup).toContain('aria-label="Revogar Emailer"')
  })

  test("without Colegas it explains that a mention in the conversation introduces a Bot", () => {
    expect(renderToStaticMarkup(<BotColleagueList bot={atlas} colleagues={[]} busy={false} onRevoke={() => {}} />)).toContain("Mencione um Bot com @ na conversa para apresentá-lo a Atlas")
  })
})
