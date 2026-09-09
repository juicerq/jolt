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

export const chatStatusClassNames: Record<ChatStatus, string> = {
  available: "bg-status-success",
  working: "bg-status-working",
  "awaiting-decision": "bg-status-awaiting-decision",
  "awaiting-response": "bg-status-awaiting-decision",
  waiting: "bg-status-warning",
  recovering: "bg-status-warning",
  completed: "bg-status-success",
  error: "bg-status-error",
}
