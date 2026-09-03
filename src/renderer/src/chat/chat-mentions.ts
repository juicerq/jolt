import type { Bot } from "../../../shared/bots"
import type { ProjectGroups } from "../../../shared/projects"
import { teamLeaders } from "../bots/team"

export type ChatMention = { botId: string; name: string }

export type ChatMentionSuggestion = ChatMention & { detail: string }

const mentionWord = /(?:^|\s)@(\S*)$/

export function mentionCandidates(groups: ProjectGroups | undefined, bot: Pick<Bot, "id" | "name" | "colleagueIds">): ChatMentionSuggestion[] {
  return teamLeaders(groups)
    .filter((candidate) => candidate.id !== bot.id && !candidate.temporary)
    .map((candidate) => ({ botId: candidate.id, name: candidate.name, detail: bot.colleagueIds.includes(candidate.id) ? "Colega" : `Vira Colega de ${bot.name}` }))
}

export function suggestChatMentions(content: string, candidates: ChatMentionSuggestion[]) {
  const word = mentionWord.exec(content)?.[1]

  if (word === undefined) {
    return []
  }

  return candidates.filter(({ name }) => name.toLowerCase().startsWith(word.toLowerCase()))
}

export function applyChatMention(content: string, mention: ChatMention) {
  return content.replace(/@\S*$/, `@${mention.name} `)
}

export function mentionedBotIds(content: string, mentions: ChatMention[]) {
  return [...new Set(mentions.filter((mention) => content.includes(`@${mention.name}`)).map((mention) => mention.botId))]
}
