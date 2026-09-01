const waitingMessageTemplates = [
  "Contatando {name}…",
  "Aguardando resposta de {name}…",
  "Chamando {name}…",
  "Encaminhando sua mensagem para {name}…",
  "Enviando sua mensagem para {name}…",
  "Entregando sua mensagem a {name}…",
  "Passando sua mensagem para {name}…",
  "Compartilhando sua mensagem com {name}…",
  "Repassando sua mensagem para {name}…",
  "Direcionando sua mensagem a {name}…",
  "Levando sua mensagem até {name}…",
  "Apresentando sua mensagem a {name}…",
  "Solicitando uma resposta de {name}…",
  "Pedindo uma resposta a {name}…",
  "Aguardando o retorno de {name}…",
  "Esperando um retorno de {name}…",
  "Buscando uma resposta de {name}…",
  "Consultando {name}…",
  "Conectando você com {name}…",
  "Abrindo a conversa com {name}…",
  "Iniciando contato com {name}…",
  "Estabelecendo contato com {name}…",
  "Trazendo {name} para a conversa…",
  "Colocando {name} na conversa…",
  "Pedindo a atenção de {name}…",
  "Avisando {name}…",
  "Notificando {name}…",
  "Acionando {name}…",
  "Falando com {name}…",
  "Fazendo contato com {name}…",
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
