import type { AccountState } from "../../../shared/plugin-kinds"

export const accountStateLabels: Record<AccountState, string> = {
  connected: "Conectada",
  "needs-auth": "Precisa autenticar",
  failed: "Com falha",
}

export const accountStateClassNames: Record<AccountState, string> = {
  connected: "bg-status-success",
  "needs-auth": "bg-status-warning",
  failed: "bg-status-error",
}
