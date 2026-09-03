import { describe, expect, test } from "bun:test"
import { applyChatMention, mentionCandidates, mentionedBotIds, suggestChatMentions } from "@src/renderer/src/chat/chat-mentions"
import type { Bot } from "@src/shared/bots"
import type { ProjectGroups } from "@src/shared/projects"

function bot(id: string, name: string, leaderBotId: string | null = null, temporary = false): Bot {
  return { id, leaderBotId, projectId: null, name, provider: "codex", function: { outcome: `Entregar ${name}` }, workingDirectoryOverride: null, temporary, memoryEnabled: true, effort: "medium", model: null, permissionMode: "ask", createdAt: "2026-09-01T12:00:00.000Z", effectiveWorkingDirectory: `/tmp/${id}`, closed: false, colleagueIds: [] }
}

const atlas = { ...bot("atlas", "Atlas"), colleagueIds: ["emailer"] }
const groups: ProjectGroups = {
  projects: [{ id: "p1", name: "Loja", defaultWorkingDirectory: "/tmp/loja", createdAt: "2026-09-01T12:00:00.000Z", bots: [{ ...atlas, members: [bot("calo", "Calo", "atlas"), bot("revisor", "Revisor", "atlas", true)] }] }],
  unassignedBots: [{ ...bot("emailer", "Emailer"), members: [] }, { ...bot("drafter", "Drafter"), members: [] }],
}

describe("mention candidates", () => {
  test("offers every top-level Bot except the Bot itself and says which ones are already Colegas", () => {
    expect(mentionCandidates(groups, atlas)).toEqual([
      { botId: "emailer", name: "Emailer", detail: "Colega" },
      { botId: "drafter", name: "Drafter", detail: "Vira Colega de Atlas" },
    ])
  })

  test("a member sees the same candidates and never another member", () => {
    expect(mentionCandidates(groups, bot("calo", "Calo", "atlas")).map((candidate) => candidate.name)).toEqual(["Atlas", "Emailer", "Drafter"])
  })
})

describe("mention suggestions", () => {
  const candidates = mentionCandidates(groups, atlas)

  test.each(["@", "Peça ao @", "linha\n@"])("%s offers every candidate", (content) => {
    expect(suggestChatMentions(content, candidates).map((candidate) => candidate.name)).toEqual(["Emailer", "Drafter"])
  })

  test.each(["@e", "Peça ao @EMA", "@Emailer"])("%s narrows by name while the word is typed", (content) => {
    expect(suggestChatMentions(content, candidates).map((candidate) => candidate.name)).toEqual(["Emailer"])
  })

  test.each(["@Emailer ", "ana@example.com", "olá", "@x"])("%s shows no menu", (content) => {
    expect(suggestChatMentions(content, candidates)).toEqual([])
  })
})

describe("applying a mention", () => {
  test("replaces the word being typed with the name and a space", () => {
    expect(applyChatMention("Peça ao @ema", { botId: "emailer", name: "Emailer" })).toBe("Peça ao @Emailer ")
    expect(applyChatMention("@", { botId: "emailer", name: "Emailer" })).toBe("@Emailer ")
  })
})

describe("mentioned Bots on send", () => {
  test("keeps only the mentions still present in the text, once each", () => {
    const mentions = [{ botId: "emailer", name: "Emailer" }, { botId: "drafter", name: "Drafter" }, { botId: "emailer", name: "Emailer" }]

    expect(mentionedBotIds("@Emailer manda e @Emailer confirma", mentions)).toEqual(["emailer"])
    expect(mentionedBotIds("sem menção", mentions)).toEqual([])
  })
})
