import type { Bot } from "../../../shared/bots"

export function groupMembers(members: Bot[]) {
  return {
    permanent: members.filter((member) => !member.temporary),
    active: members.filter((member) => member.temporary && !member.closed),
    closed: members.filter((member) => member.closed),
  }
}

export function describeMember(bot: Bot) {
  if (bot.closed) {
    return `Encerrado · ${bot.function.outcome}`
  }

  if (bot.temporary) {
    return `Temporário · ${bot.function.outcome}`
  }

  return bot.function.outcome
}
