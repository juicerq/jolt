export type ChatCommandSuggestion = {
  command: "compactar" | "lembrar"
  detail: string
}

export type ChatCommand =
  | { command: "compactar"; instructions?: string }
  | { command: "lembrar"; content: string }

type ChatCommandContext = { memoryEnabled: boolean }

export function suggestChatCommands(content: string, context: ChatCommandContext): ChatCommandSuggestion[] {
  const word = /^\/(\S*)$/.exec(content)?.[1]

  if (word === undefined) {
    return []
  }

  const available: ChatCommandSuggestion[] = [
    { command: "compactar", detail: "Resume o Contexto do Bot com instruções opcionais" },
    ...(context.memoryEnabled ? [{ command: "lembrar" as const, detail: "Guarda uma Lembrança na Memória do Bot" }] : []),
  ]

  return available.filter(({ command }) => command.startsWith(word.toLowerCase()))
}

export function completeChatCommand(suggestion: ChatCommandSuggestion) {
  return `/${suggestion.command} `
}

export function parseChatCommand(content: string, context: ChatCommandContext): ChatCommand | null {
  const compact = /^\/compactar(?:\s+([\s\S]*))?$/i.exec(content)

  if (compact) {
    const instructions = (compact[1] ?? "").trim()

    return { command: "compactar", ...(instructions ? { instructions } : {}) }
  }

  const match = /^\/lembrar(?:\s+([\s\S]*))?$/i.exec(content)

  if (!match || !context.memoryEnabled) {
    return null
  }

  return { command: "lembrar", content: (match[1] ?? "").trim() }
}
