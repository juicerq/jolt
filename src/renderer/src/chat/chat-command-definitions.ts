export const chatCommandDefinitions = {
  new: { aliases: ["novo"], detail: "Começa uma sessão sem o contexto anterior", placeholder: "Enter para começar uma sessão nova e esvaziar a Fila" },
  memory: { aliases: ["lembrar"], detail: "Guarda uma Lembrança na Memória do Bot", placeholder: "O que o Bot deve guardar na Memória..." },
  compact: { aliases: [], detail: "Resume o contexto da sessão para liberar espaço", placeholder: "Instruções opcionais para o resumo · Enter para compactar" },
  reload: { aliases: [], detail: "Recarrega skills e instruções preservando a sessão", placeholder: "Enter para recarregar as skills e instruções" },
} satisfies Record<string, { aliases: string[]; detail: string; placeholder: string }>

export type ChatCommandName = keyof typeof chatCommandDefinitions

export function chatCommandName(value: unknown): ChatCommandName | undefined {
  if (typeof value !== "string") {
    return
  }

  const word = value.toLowerCase()

  return (Object.keys(chatCommandDefinitions) as ChatCommandName[]).find((name) => name === word || chatCommandDefinitions[name].aliases.some((alias) => alias === word))
}

/** Slash tokens are separated from prose by whitespace, so URLs and paths stay literal. */
export function chatSlash(content: string, caret = content.length) {
  const match = /(?:^|\s)\/(\S*)$/.exec(content.slice(0, caret))

  if (match?.[1] === undefined) {
    return null
  }

  return { word: match[1], start: caret - match[1].length - 1, end: caret }
}

export function withoutChatSlash(content: string, slash: NonNullable<ReturnType<typeof chatSlash>>) {
  return `${content.slice(0, slash.start)}${content.slice(slash.end)}`
}

export function commandConsumesContent(command: ChatCommandName) {
  return command === "memory" || command === "compact"
}

export function commandAllowedWhileWorking(command: ChatCommandName) {
  return command === "new"
}
