export type ChatCommandName = "lembrar"

export interface ChatCommandSuggestion {
  command: ChatCommandName
  detail: string
}

export interface ChatCommand { command: "lembrar"; content: string }

interface ChatCommandContext { memoryEnabled: boolean }

function availableChatCommands(context: ChatCommandContext): ChatCommandSuggestion[] {
  if (!context.memoryEnabled) {
    return []
  }

  return [{ command: "lembrar", detail: "Guarda uma Lembrança na Memória do Bot" }]
}

export function suggestChatCommands(content: string, context: ChatCommandContext): ChatCommandSuggestion[] {
  const word = /^\/(\S*)$/.exec(content)?.[1]

  if (word === undefined) {
    return []
  }

  return availableChatCommands(context).filter(({ command }) => command.startsWith(word.toLowerCase()))
}

export function startedChatCommand(content: string, context: ChatCommandContext) {
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

export function buildChatCommand(command: ChatCommandName, content: string, context: ChatCommandContext): ChatCommand | null {
  const text = content.trim()

  if (!context.memoryEnabled || text === "") {
    return null
  }

  return { command, content: text }
}

export const chatCommandPlaceholders: Record<ChatCommandName, string> = {
  lembrar: "O que o Bot deve guardar na Memória...",
}
