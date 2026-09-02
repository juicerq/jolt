export type ChatCommandSuggestion = {
  command: "lembrar"
  label: string
  detail: string
  content: string | null
}

export function isChatCommand(content: string) {
  return content.startsWith("/") && !content.includes("\n")
}

export function suggestChatCommands(content: string, context: { memoryEnabled: boolean }): ChatCommandSuggestion[] {
  if (!isChatCommand(content) || !context.memoryEnabled) {
    return []
  }

  const [name = ""] = content.slice(1).split(/\s+/)
  const commandMatches = "lembrar".startsWith(name.toLowerCase())

  if (!commandMatches) {
    return []
  }

  const rememberContent = content.slice(1).replace(/^\S*\s*/, "").trim()

  return [{
    command: "lembrar",
    label: "/lembrar",
    detail: rememberContent || "Escreva a Lembrança depois do comando",
    content: rememberContent || null,
  }]
}

export function completeChatCommand(suggestion: ChatCommandSuggestion) {
  return `/${suggestion.command} ${suggestion.content ?? ""}`
}
