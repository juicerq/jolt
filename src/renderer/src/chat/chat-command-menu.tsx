import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { Bot } from "../../../shared/bots"
import type { EngineClient } from "../engine-client"
import { MenuOption, menuCardClassName } from "../ui/menu"
import { type ChatCommandSuggestion, suggestChatCommands } from "./chat-commands"

export function useChatCommands(bot: Bot, client: EngineClient, content: string) {
  const queryClient = useQueryClient()
  const { mutate: remember } = useMutation(client.query.memory.add.mutationOptions({
    onSuccess() {
      queryClient.invalidateQueries({ queryKey: client.query.memory.list.queryOptions({ input: { botId: bot.id } }).queryKey })
    },
  }))
  const suggestions = suggestChatCommands(content, { memoryEnabled: bot.memoryEnabled })

  function run(suggestion: ChatCommandSuggestion) {
    if (suggestion.content === null) {
      return false
    }

    remember({ botId: bot.id, content: suggestion.content })

    return true
  }

  return { suggestions, run }
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
        <MenuOption key={suggestion.command} label={suggestion.label} detail={suggestion.detail} selected={index === highlighted} disabled={suggestion.content === null} onSelect={() => onPick(index)} onHover={() => onHighlight(index)} />
      ))}
    </div>
  )
}
