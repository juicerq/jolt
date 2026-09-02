export type ChatCommandSuggestion = {
  command: "lembrar"
  detail: string
}

export type ChatCommand = {
  command: "lembrar"
  content: string
}

type ChatCommandContext = { memoryEnabled: boolean }

export function suggestChatCommands(content: string, context: ChatCommandContext): ChatCommandSuggestion[] {
  const word = /^\/(\S*)$/.exec(content)?.[1]

  if (word === undefined || !context.memoryEnabled) {
    return []
  }

  const commandMatches = "lembrar".startsWith(word.toLowerCase())

  if (!commandMatches) {
    return []
  }

  return [{ command: "lembrar", detail: "Guarda uma Lembrança na Memória do Bot" }]
}

export function completeChatCommand(suggestion: ChatCommandSuggestion) {
  return `/${suggestion.command} `
}

export function parseChatCommand(content: string, context: ChatCommandContext): ChatCommand | null {
  const match = /^\/lembrar(?:\s+([\s\S]*))?$/i.exec(content)

  if (!match || !context.memoryEnabled) {
    return null
  }

  return { command: "lembrar", content: (match[1] ?? "").trim() }
}
