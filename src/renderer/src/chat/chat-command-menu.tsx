import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { Bot } from "../../../shared/bots"
import type { EngineClient } from "../engine-client"
import { MenuOption, menuCardClassName } from "../ui/menu"
import { type ChatCommand, type ChatCommandSuggestion, parseChatCommand, suggestChatCommands } from "./chat-commands"

export function useChatCommands(bot: Bot, client: EngineClient, content: string) {
  const queryClient = useQueryClient()
  const { mutate: remember } = useMutation(client.query.memory.add.mutationOptions({
    onSuccess() {
      queryClient.invalidateQueries({ queryKey: client.query.memory.list.queryOptions({ input: { botId: bot.id } }).queryKey })
    },
  }))
  const context = { memoryEnabled: bot.memoryEnabled }
  const suggestions = suggestChatCommands(content, context)
  const command = parseChatCommand(content, context)

  function run(target: ChatCommand) {
    if (target.content === "") {
      return false
    }

    remember({ botId: bot.id, content: target.content })

    return true
  }

  return { suggestions, command, run }
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
        <MenuOption key={suggestion.command} label={`/${suggestion.command}`} detail={suggestion.detail} selected={index === highlighted} onSelect={() => onPick(index)} onHover={() => onHighlight(index)} />
      ))}
    </div>
  )
}
