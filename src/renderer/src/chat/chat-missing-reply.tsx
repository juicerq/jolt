import { NoSymbolIcon } from "@heroicons/react/24/outline"
import type { Bot } from "../../../shared/bots"
import type { ConversationMessage } from "../../../shared/conversations"

export function ChatMissingReply({ bot, messages }: { bot: Pick<Bot, "id" | "name">; messages: Pick<ConversationMessage, "authorBotId">[] }) {
  const last = messages.at(-1)

  if (!last || last.authorBotId === bot.id) {
    return null
  }

  return (
    <p className="m-0 grid w-fit grid-cols-[16px_auto] items-center gap-[7px] px-[7px] py-[5px] text-support text-muted [&_svg]:stroke-[1.75]">
      <NoSymbolIcon className="size-4" aria-hidden="true" />
      <span>{bot.name} não respondeu</span>
    </p>
  )
}
