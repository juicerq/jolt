import { Blobatar } from "@blobatar/react"
import { botAvatarName } from "../bots/bot-avatar"
import type { ChatMention } from "./chat-mentions"

export function ChatMentionChip({ mention }: { mention: ChatMention }) {
  return (
    <span className="mx-px inline-block whitespace-nowrap rounded-md border border-outline-strong bg-surface-hover px-1.5 py-[3px] text-control font-medium text-primary leading-none">
      <Blobatar className="mr-1 inline-block size-3.5 rounded-[5px] bg-surface-active align-[-0.22em]" name={botAvatarName({ id: mention.botId, name: mention.name })} size={14} alt="" />
      {mention.name}
    </span>
  )
}
