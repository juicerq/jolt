import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { Bot } from "../../../shared/bots"
import type { EngineClient } from "../engine-client"
import { MenuOption, menuCardClassName } from "../ui/menu"
import { buildChatCommand, type ChatCommand, type ChatCommandSuggestion, startedChatCommand, suggestChatCommands } from "./chat-commands"
import type { ChatDraft } from "./chat-store"

export function useChatCommands(bot: Bot, client: EngineClient, draft: ChatDraft) {
  const queryClient = useQueryClient()
  const { mutateAsync: remember, isPending: remembering, error: rememberError, reset: resetRemember } = useMutation(client.query.memory.add.mutationOptions({
    onSuccess() {
      queryClient.invalidateQueries({ queryKey: client.query.memory.list.queryOptions({ input: { botId: bot.id } }).queryKey })
    },
  }))
  const { mutateAsync: compact, isPending: compacting, error: compactError, data: compacted, reset: resetCompact, variables: compactVariables } = useMutation(client.query.conversations.compact.mutationOptions())
  const context = { memoryEnabled: bot.memoryEnabled }
  const suggestions = draft.command ? [] : suggestChatCommands(draft.content, context)
  const command = draft.command ? buildChatCommand(draft.command, draft.content, context) : null

  function start(content: string) {
    return draft.command ? null : startedChatCommand(content, context)
  }

  async function run(target: ChatCommand) {
    if (target.command === "compactar") {
      await compact({ botId: bot.id, ...(target.instructions ? { instructions: target.instructions } : {}) })

      return
    }

    await remember({ botId: bot.id, content: target.content })
  }

  function reset() {
    resetRemember()
    resetCompact()
  }

  const ownCompaction = compactVariables?.botId === bot.id

  return {
    suggestions,
    command,
    start,
    run,
    reset,
    pending: remembering || compacting,
    error: rememberError ?? compactError,
    compacted: ownCompaction ? compacted : undefined,
    compacting: ownCompaction && compacting,
  }
}

type ChatCommandMenuProps = {
  id: string
  suggestions: ChatCommandSuggestion[]
  highlighted: number
  onHighlight(index: number): void
  onPick(index: number): void
}

export function ChatCommandMenu({ id, suggestions, highlighted, onHighlight, onPick }: ChatCommandMenuProps) {
  return (
    <div className={`${menuCardClassName} absolute bottom-full left-0 mb-2 max-h-72 max-w-full overflow-y-auto`} id={id} role="listbox" aria-label="Comandos">
      {suggestions.map((suggestion, index) => (
        <MenuOption key={suggestion.command} label={suggestion.command} detail={suggestion.detail} selected={index === highlighted} onSelect={() => onPick(index)} onHover={() => onHighlight(index)} />
      ))}
    </div>
  )
}
