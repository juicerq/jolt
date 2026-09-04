import type { Bot } from "@src/shared/bots"

export function groupMembers(members: Bot[]) {
  return {
    permanent: members.filter((member) => !member.temporary),
    active: members.filter((member) => member.temporary && !member.closed),
    closed: members.filter((member) => member.closed),
  }
}

export function describeMember(bot: Bot) {
  if (bot.temporary && !bot.closed) {
    return `Temporário · ${bot.function.outcome}`
  }

  return bot.function.outcome
}

export function highlightedBotId(leader: Pick<Bot, "id"> & { members: Pick<Bot, "id">[] }, selectedBotId: string | null, expanded: boolean) {
  const memberSelected = leader.members.some((member) => member.id === selectedBotId)

  if (!expanded && memberSelected) {
    return leader.id
  }

  return selectedBotId
}
