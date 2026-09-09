import { Store } from "@tanstack/react-store"

const storageKey = "mimo.bot-order.v1"

function loadOrder(): Record<string, string[]> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "{}")

    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {}
    }

    return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string[]] => Array.isArray(entry[1]) && entry[1].every((id: unknown) => typeof id === "string")))
  } catch {
    return {}
  }
}

export const botOrderStore = new Store(loadOrder())

export function orderedBots<T extends { id: string }>(bots: T[], order: string[] = []) {
  const positions = new Map(order.map((id, index) => [id, index]))

  return [...bots].sort((a, b) => (positions.get(a.id) ?? order.length) - (positions.get(b.id) ?? order.length))
}

export function saveBotOrder(group: string, visible: string[]) {
  // Search can hide siblings: replace only the visible slots in the saved order.
  const current = [...new Set([...(botOrderStore.state[group] ?? []), ...visible])]
  const moved = new Set(visible)
  let index = 0
  const order = current.map((id) => moved.has(id) ? visible[index++] : id)

  botOrderStore.setState((state) => ({ ...state, [group]: order }))

  try {
    localStorage.setItem(storageKey, JSON.stringify(botOrderStore.state))

    return true
  } catch {
    return false
  }
}
