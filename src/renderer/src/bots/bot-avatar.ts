import type { Bot } from "../../../shared/bots"

export function botAvatarName(bot: Pick<Bot, "id" | "name">) {
  return `jolt:${bot.id}:${bot.name}`
}
