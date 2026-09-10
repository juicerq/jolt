import type { BotRoute } from "./bots-store"

export type BotPageName = Exclude<BotRoute["name"], "chat">

export const botRouteTitles: Record<BotRoute["name"], string> = {
  chat: "Conversa",
  details: "Sobre o Bot",
  settings: "Configurações",
  members: "Integrantes",
  routines: "Rotinas",
  routine: "Rotina",
  triggers: "Gatilhos",
  trigger: "Gatilho",
  memory: "Memórias",
  archive: "Acervo",
}
