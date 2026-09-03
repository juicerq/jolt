export type ChatCommandName = "compactar" | "lembrar"

export type ChatCommandSuggestion = {
  command: ChatCommandName
  detail: string
}

export type ChatCommand =
  | { command: "compactar"; instructions?: string }
  | { command: "lembrar"; content: string }

type ChatCommandContext = { memoryEnabled: boolean }

function availableChatCommands(context: ChatCommandContext): ChatCommandSuggestion[] {
  return [
    { command: "compactar", detail: "Resume o Contexto do Bot com instruções opcionais" },
    ...(context.memoryEnabled ? [{ command: "lembrar" as const, detail: "Guarda uma Lembrança na Memória do Bot" }] : []),
  ]
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

  if (command === "compactar") {
    return { command, ...(text ? { instructions: text } : {}) }
  }

  if (!context.memoryEnabled || text === "") {
    return null
  }

  return { command, content: text }
}

export const chatCommandPlaceholders: Record<ChatCommandName, string> = {
  compactar: "Instruções para o resumo, se quiser...",
  lembrar: "O que o Bot deve guardar na Memória...",
}
