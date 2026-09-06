const waitingMessageTemplates = [
  "Aguardando resposta de {name}…",
  "Chamando {name}…",
  "Esperando {name} responder…",
] as const

let nextMessageIndex = 0

export function nextChatWaitingMessage() {
  const template = waitingMessageTemplates[nextMessageIndex % waitingMessageTemplates.length]
  nextMessageIndex++

  return template
}

export function formatChatWaitingMessage(template: string, botName: string) {
  return template.replace("{name}", botName)
}
