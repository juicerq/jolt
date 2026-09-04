import { Blobatar } from "@blobatar/react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { Bot } from "../../../shared/bots"
import type { EngineClient } from "../engine-client"
import { MenuOption, menuCardClassName } from "../ui/menu"
import { buildChatCommand, type ChatCommand, startedChatCommand, suggestChatCommands } from "./chat-commands"
import type { ChatDraft } from "./chat-store"

export function useChatCommands(bot: Bot, client: EngineClient, draft: ChatDraft) {
  const queryClient = useQueryClient()
  const { mutateAsync: remember, isPending: remembering, error: rememberError, reset } = useMutation(client.query.memory.add.mutationOptions({
    onSuccess() {
      queryClient.invalidateQueries({ queryKey: client.query.memory.list.queryOptions({ input: { botId: bot.id } }).queryKey })
    },
  }))
  const context = { memoryEnabled: bot.memoryEnabled }
  const suggestions = draft.command ? [] : suggestChatCommands(draft.content, context)
  const command = draft.command ? buildChatCommand(draft.command, draft.content, context) : null

  function start(content: string) {
    if (draft.command) {
      return null
    }

    return startedChatCommand(content, context)
  }

  async function run(target: ChatCommand) {
    await remember({ botId: bot.id, content: target.content })
  }

  return {
    suggestions,
    command,
    start,
    run,
    reset,
    pending: remembering,
    error: rememberError,
  }
}

export interface ChatMenuChoice { key: string; label: string; detail: string; avatar?: string }

interface ChatCommandMenuProps {
  id: string
  label: string
  choices: ChatMenuChoice[]
  highlighted: number
  onHighlight(index: number): void
  onPick(index: number): void
}

export function ChatCommandMenu({ id, label, choices, highlighted, onHighlight, onPick }: ChatCommandMenuProps) {
  return (
    <div className={`${menuCardClassName} absolute bottom-full left-0 mb-2 max-h-72 max-w-full overflow-y-auto`} id={id} role="listbox" aria-label={label}>
      {choices.map((choice, index) => (
        <MenuOption key={choice.key} label={choice.label} detail={choice.detail} icon={choice.avatar ? <Blobatar className="size-5 shrink-0 rounded-md border border-outline-strong bg-surface-raised" name={choice.avatar} size={20} alt="" /> : undefined} selected={index === highlighted} onSelect={() => onPick(index)} onHover={() => onHighlight(index)} />
      ))}
    </div>
  )
}
