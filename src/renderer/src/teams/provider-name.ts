import type { ProviderAvailability } from "../../../shared/providers"

export function formatProvider(provider: ProviderAvailability["provider"]) {
  return provider === "codex" ? "Codex" : "Claude Code"
}
