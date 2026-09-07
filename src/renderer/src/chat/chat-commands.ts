import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { Bot } from "@src/shared/bots"
import type { EngineClient } from "../engine-client"
import type { ChatDraft } from "./chat-store"

export type ChatCommandName = "lembrar"

export interface ChatCommandSuggestion {
  command: ChatCommandName
  detail: string
}

export interface ChatCommand { command: ChatCommandName; content: string }

interface ChatCommandContext { memoryEnabled: boolean }

export function useChatCommands(bot: Bot, client: EngineClient, draft: ChatDraft) {
  const queryClient = useQueryClient()
  const { mutateAsync: remember, isPending: remembering, error: rememberError, reset } = useMutation(client.query.memory.add.mutationOptions({
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: client.query.memory.list.queryOptions({ input: { botId: bot.id } }).queryKey })
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

function availableChatCommands(context: ChatCommandContext): ChatCommandSuggestion[] {
  if (!context.memoryEnabled) {
    return []
  }

  return [{ command: "lembrar", detail: "Guarda uma Lembrança na Memória do Bot" }]
}

function suggestChatCommands(content: string, context: ChatCommandContext): ChatCommandSuggestion[] {
  const word = /^\/(\S*)$/.exec(content)?.[1]

  if (word === undefined) {
    return []
  }

  return availableChatCommands(context).filter(({ command }) => command.startsWith(word.toLowerCase()))
}

function startedChatCommand(content: string, context: ChatCommandContext) {
  const match = /^\/(\S+)\s([\s\S]*)$/.exec(content)

  if (!match) {
    return null
  }

  const word = (match[1] ?? "").toLowerCase()
  const started = availableChatCommands(context).find(({ command }) => command === word)

  if (!started) {
    return null
  }

  return { command: started.command, content: match[2] ?? "" }
}

function buildChatCommand(command: ChatCommandName, content: string, context: ChatCommandContext): ChatCommand | null {
  const text = content.trim()

  if (!context.memoryEnabled || text === "") {
    return null
  }

  return { command, content: text }
}

export const chatCommandPlaceholders: Record<ChatCommandName, string> = {
  lembrar: "O que o Bot deve guardar na Memória...",
}
