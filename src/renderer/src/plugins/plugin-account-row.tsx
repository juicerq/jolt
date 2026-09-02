import type { ReactNode } from "react"
import type { PluginAccount } from "../../../shared/plugins"
import { accountStateClassNames, accountStateLabels } from "./account-states"

export function describeAccount(account: Pick<PluginAccount, "state" | "botIds">) {
  const bots = account.botIds.length === 0 ? "Nenhum Bot usa" : account.botIds.length === 1 ? "1 Bot usa" : `${account.botIds.length} Bots usam`

  return `${accountStateLabels[account.state]} · ${bots}`
}

export function PluginAccountRow({ account, actions }: { account: Pick<PluginAccount, "label" | "state" | "botIds">; actions?: ReactNode }) {
  return (
    <li className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
      <span className={`size-[7px] shrink-0 rounded-full ${accountStateClassNames[account.state]}`} role="img" aria-label={accountStateLabels[account.state]} />
      <div className="min-w-0 flex-1">
        <p className="m-0 overflow-hidden text-ellipsis whitespace-nowrap text-control font-medium text-primary">{account.label}</p>
        <p className="m-0 text-support text-muted">{describeAccount(account)}</p>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </li>
  )
}
