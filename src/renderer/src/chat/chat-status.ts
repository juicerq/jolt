import type { ChatStatus } from "./chat-store"

export const chatStatusLabels: Record<ChatStatus, string> = {
  available: "Disponível",
  working: "Trabalhando",
  "awaiting-decision": "Aguardando decisão",
  "awaiting-response": "Aguardando resposta",
  waiting: "Interrompendo",
  recovering: "Aguardando provedor",
  completed: "Concluído",
  error: "Erro",
}
