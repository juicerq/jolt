import type { ProviderName } from "@src/shared/providers"
import { piProviders } from "./pi-models"

const resetFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" })
const durationUnits: Record<string, number> = { day: 86_400_000, hr: 3_600_000, min: 60_000, sec: 1_000 }

function resetNotice(error: string) {
  const duration = /Resets in ([\d\s.a-z]+)\./i.exec(error)?.[1]

  if (!duration) {
    return "O provedor não informou quando o limite será liberado."
  }

  const parts = [...duration.matchAll(/(\d+)\s*(day|hr|min|sec)s?\b/g)]
  const delayMs = parts.reduce((total, part) => total + Number(part[1]) * durationUnits[part[2]], 0)

  if (parts.length === 0 || duration.replace(/(\d+)\s*(day|hr|min|sec)s?\b/g, "").trim()) {
    return "O provedor não informou quando o limite será liberado."
  }

  return `Liberação prevista para ${resetFormat.format(Date.now() + delayMs)}.`
}

export function describePiFailure(error: string, provider: ProviderName) {
  const name = piProviders[provider].name

  if (/GoUsageLimitError|FreeUsageLimitError/.test(error)) {
    return `Limite de uso do ${name} atingido. ${resetNotice(error)} As tentativas automáticas foram encerradas.`
  }

  if (/insufficient_quota|out of budget|quota exceeded|billing|available balance/i.test(error)) {
    return `O ${name} informou que a cota ou o saldo disponível se esgotou. Confira sua conta no provedor antes de tentar novamente.`
  }

  if (/rate.?limit|too many requests|429|overloaded|service.?unavailable/i.test(error)) {
    return `O ${name} continua indisponível após as tentativas de recuperação. Você pode tentar novamente mais tarde ou trocar o modelo.`
  }

  return error
}
