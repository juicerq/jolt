import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { Bot } from "@src/shared/bots"
import type { EngineClient } from "../engine-client"
import type { ChatDraft } from "./chat-store"

export type ChatCommandName = "lembrar" | "novo"

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
  const { mutateAsync: newSession, isPending: renewing, error: renewError, reset: resetSession, isSuccess: renewed } = useMutation(client.query.conversations.newSession.mutationOptions())
  const context = { memoryEnabled: bot.memoryEnabled }
  const suggestions = draft.command ? [] : suggestChatCommands(draft.content, context)
  const typedNew = !draft.command && draft.content.trim().toLowerCase() === "/novo"
  const selected = draft.command ?? (typedNew ? "novo" : undefined)
  const command = selected ? buildChatCommand(selected, typedNew ? "" : draft.content, context) : null

  function start(content: string) {
    if (draft.command) {
      return null
    }

    return startedChatCommand(content, context)
  }

  async function run(target: ChatCommand) {
    if (target.command === "novo") {
      await newSession({ botId: bot.id })

      return
    }

    await remember({ botId: bot.id, content: target.content })
  }

  return {
    suggestions,
    command,
    start,
    run,
    reset: () => {
      if (remembering || renewing) {
        return
      }

      reset()
      resetSession()
    },
    pending: remembering || renewing,
    error: rememberError ?? renewError,
    renewed,
  }
}

function availableChatCommands(context: ChatCommandContext): ChatCommandSuggestion[] {
  return [
    { command: "novo", detail: "Começa uma sessão sem o contexto anterior e recarrega as instruções" },
    ...(context.memoryEnabled ? [{ command: "lembrar" as const, detail: "Guarda uma Lembrança na Memória do Bot" }] : []),
  ]
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

  if (command === "novo") {
    if (text !== "") {
      return null
    }

    return { command, content: "" }
  }

  if (!context.memoryEnabled || text === "") {
    return null
  }

  return { command, content: text }
}

export const chatCommandPlaceholders: Record<ChatCommandName, string> = {
  novo: "Enter para começar uma sessão nova e esvaziar a Fila",
  lembrar: "O que o Bot deve guardar na Memória...",
}
