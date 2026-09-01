import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { Bot } from "../../../shared/bots"
import { useUpdateBot } from "../bots/bot-update"
import type { EngineClient } from "../engine-client"
import { MenuDivider, MenuLabel, MenuOption, menuCardClassName } from "../ui/menu"
import { type ChatCommandAction, type ChatCommandSuggestion, suggestChatCommands } from "./chat-commands"

const sections: { command: ChatCommandSuggestion["command"]; label: string }[] = [
  { command: "modelo", label: "/modelo" },
  { command: "esforco", label: "/esforco" },
  { command: "lembrar", label: "/lembrar" },
]

export function useChatCommands(bot: Bot, client: EngineClient, content: string) {
  const queryClient = useQueryClient()
  const { data: providerModels } = useQuery(client.query.providers.models.queryOptions())
  const catalog = providerModels?.find((entry) => entry.provider === bot.provider)
  const { update } = useUpdateBot(bot, client)
  const { mutate: remember } = useMutation(client.query.memory.add.mutationOptions({
    onSuccess() {
      queryClient.invalidateQueries({ queryKey: client.query.memory.list.queryOptions({ input: { botId: bot.id } }).queryKey })
    },
  }))
  const suggestions = suggestChatCommands(content, { catalog, memoryEnabled: bot.memoryEnabled })

  function run(action: ChatCommandAction) {
    if (action.kind === "model") {
      update({ model: action.model })

      return
    }

    if (action.kind === "effort") {
      update({ effort: action.effort })

      return
    }

    remember({ botId: bot.id, content: action.content })
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
  const groups = sections
    .map((section) => ({ ...section, items: suggestions.map((suggestion, index) => ({ suggestion, index })).filter((entry) => entry.suggestion.command === section.command) }))
    .filter((group) => group.items.length > 0)

  return (
    <div className={`${menuCardClassName} absolute bottom-full left-0 mb-2 max-h-72 max-w-full overflow-y-auto`} id={id} role="listbox" aria-label="Comandos">
      {groups.map((group, groupIndex) => (
        <div key={group.command} role="group" aria-labelledby={`${id}-${group.command}`}>
          {groupIndex > 0 && <MenuDivider />}
          <MenuLabel id={`${id}-${group.command}`}>{group.label}</MenuLabel>
          {group.items.map(({ suggestion, index }) => (
            <MenuOption key={`${suggestion.command}-${suggestion.label}`} label={suggestion.label} detail={suggestion.detail} selected={index === highlighted} standard={suggestion.standard} disabled={!suggestion.action} onSelect={() => onPick(index)} onHover={() => onHighlight(index)} />
          ))}
        </div>
      ))}
    </div>
  )
}
