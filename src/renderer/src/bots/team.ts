import type { Bot } from "../../../shared/bots"
import type { ProjectGroups } from "../../../shared/projects"

export function teamLeaders(groups: ProjectGroups | undefined) {
  if (!groups) {
    return []
  }

  return [...groups.projects.flatMap((project) => project.bots), ...groups.unassignedBots]
}

export function teamBots(groups: ProjectGroups | undefined): Bot[] {
  return teamLeaders(groups).flatMap((leader) => [leader, ...leader.members])
}

export function findTeamBot(groups: ProjectGroups | undefined, id: string) {
  return teamBots(groups).find((bot) => bot.id === id)
}

export function teamNames(groups: ProjectGroups | undefined) {
  return Object.fromEntries(teamBots(groups).map((bot) => [bot.id, bot.name]))
}

export function teamOf(groups: ProjectGroups | undefined, bot: Pick<Bot, "id" | "leaderBotId">) {
  const leaders = teamLeaders(groups)
  const leader = bot.leaderBotId ? leaders.find((candidate) => candidate.id === bot.leaderBotId) : undefined
  const members = leaders.find((candidate) => candidate.id === bot.id)?.members.filter((member) => !member.closed) ?? []

  return { leader, members }
}
