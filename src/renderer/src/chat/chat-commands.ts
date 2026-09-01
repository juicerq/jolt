import { type BotEffort, botEfforts } from "../../../shared/bots"
import type { ProviderModels } from "../../../shared/providers"
import { effortLabels } from "../bots/bot-effort"

export type ChatCommandAction =
  | { kind: "model"; model: string }
  | { kind: "effort"; effort: BotEffort }
  | { kind: "remember"; content: string }

export type ChatCommandSuggestion = {
  command: "modelo" | "esforco" | "lembrar"
  label: string
  detail?: string
  standard: boolean
  action: ChatCommandAction | null
}

type ChatCommandContext = {
  catalog: Pick<ProviderModels, "default" | "models"> | undefined
  memoryEnabled: boolean
}

export function isChatCommand(content: string) {
  return content.startsWith("/") && !content.includes("\n")
}

export function suggestChatCommands(content: string, context: ChatCommandContext): ChatCommandSuggestion[] {
  if (!isChatCommand(content)) {
    return []
  }

  const [name = "", ...rest] = content.slice(1).split(/\s+/)
  const argument = rest.join(" ").trim()
  const rememberContent = content.slice(1).replace(/^\S*\s*/, "").trim()

  const models = (context.catalog?.models ?? []).map((model): ChatCommandSuggestion => ({
    command: "modelo",
    label: model.name,
    standard: model.id === context.catalog?.default,
    action: { kind: "model", model: model.id },
  }))
  const efforts = botEfforts.map((effort): ChatCommandSuggestion => ({
    command: "esforco",
    label: effortLabels[effort],
    standard: effort === "medium",
    action: { kind: "effort", effort },
  }))
  const remember: ChatCommandSuggestion[] = context.memoryEnabled
    ? [{
        command: "lembrar",
        label: "Lembrar",
        detail: rememberContent || "Escreva a Lembrança depois de /lembrar",
        standard: false,
        action: rememberContent ? { kind: "remember", content: rememberContent } : null,
      }]
    : []

  return [...models, ...efforts, ...remember].filter((suggestion) => matches(suggestion, name, argument))
}

function matches(suggestion: ChatCommandSuggestion, name: string, argument: string) {
  const commandMatches = suggestion.command.startsWith(normalize(name))

  if (!commandMatches) {
    return false
  }

  if (suggestion.command === "lembrar" || argument === "") {
    return true
  }

  return normalize(suggestion.label).includes(normalize(argument))
}

function normalize(text: string) {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()
}
