import type { Bot } from "@src/shared/bots"
import type { ProjectGroups } from "@src/shared/projects"
import { teamLeaders } from "../bots/team"

export interface ChatMention { botId: string; name: string; avatarSeed: string }

export type ChatMentionSuggestion = ChatMention & { detail: string }

export interface ChatMentionSegment { text: string; mention?: ChatMention }

const mentionWord = /(?:^|\s)@(\S*)$/

export function mentionCandidates(groups: ProjectGroups | undefined, bot: Pick<Bot, "id" | "name" | "colleagueIds">): ChatMentionSuggestion[] {
  return teamLeaders(groups)
    .filter((candidate) => candidate.id !== bot.id && !candidate.temporary)
    .map((candidate) => ({ botId: candidate.id, name: candidate.name, avatarSeed: candidate.avatarSeed, detail: bot.colleagueIds.includes(candidate.id) ? "Colega" : `Vira Colega de ${bot.name}` }))
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

export function knownChatMentions(identities: Record<string, { name: string; avatarSeed: string }>): ChatMention[] {
  return Object.entries(identities).map(([botId, identity]) => ({ botId, ...identity }))
}

function activeChatMentions(content: string, mentions: ChatMention[]) {
  const seen = new Set<string>()

  return mentions.filter((mention) => {
    if (seen.has(mention.botId) || !content.includes(`@${mention.name}`)) {
      return false
    }

    seen.add(mention.botId)

    return true
  })
}

export function mentionedBotIds(content: string, mentions: ChatMention[]) {
  return activeChatMentions(content, mentions).map((mention) => mention.botId)
}

export function splitChatMentions(content: string, mentions: ChatMention[]): ChatMentionSegment[] {
  const longestFirst = [...mentions].sort((first, second) => second.name.length - first.name.length)
  const segments: ChatMentionSegment[] = []
  let text = ""
  let index = 0

  while (index < content.length) {
    const mention = content[index] === "@" ? longestFirst.find((candidate) => content.startsWith(`@${candidate.name}`, index)) : undefined

    if (!mention) {
      text += content[index]
      index += 1

      continue
    }

    if (text) {
      segments.push({ text })
      text = ""
    }

    segments.push({ text: `@${mention.name}`, mention })
    index += mention.name.length + 1
  }

  if (!text) {
    return segments
  }

  return [...segments, { text }]
}
