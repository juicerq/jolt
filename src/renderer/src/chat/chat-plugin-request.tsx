import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { PluginRequest } from "@src/shared/plugins"
import type { EngineClient } from "../engine-client"
import { accountStateLabels } from "../plugins/account-states"
import { useConnectPlugin } from "../plugins/plugin-connection"
import { PluginStepView, pluginStepLabel } from "../plugins/plugin-step"
import { Button } from "../ui/button"

export function pluginRequestTitle(request: Pick<PluginRequest, "pluginName" | "accounts">) {
  const reconnecting = request.accounts.length > 0 && request.accounts.every((account) => account.state !== "connected")

  if (reconnecting) {
    return `Reconectar ${request.pluginName}`
  }

  return `Conectar ${request.pluginName}`
}

export function pluginRequestDetail(request: Pick<PluginRequest, "pluginName" | "accounts" | "connectable">) {
  if (request.accounts.length > 0) {
    return `Escolha a Conta de ${request.pluginName} que o Bot pode usar.`
  }

  if (!request.connectable) {
    return `${request.pluginName} não está configurado neste computador.`
  }

  return `O Bot precisa de uma Conta de ${request.pluginName}.`
}

export function ChatPluginRequest({ botId, client, request }: { botId: string; client: EngineClient; request: PluginRequest }) {
  const queryClient = useQueryClient()
  const connection = useConnectPlugin(client)
  const { mutate: decide, isPending: deciding, error: decideError } = useMutation(client.query.plugins.decide.mutationOptions({
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: client.query.plugins.list.queryOptions().queryKey })
    },
  }))
  const busy = connection.isPending || deciding
  const failure = connection.error?.message ?? decideError?.message
  const connectLabel = request.accounts.length > 0 ? "Outra Conta" : "Conectar"

  return (
    <section className="flex min-w-0 flex-col gap-3" aria-label="Pedido de Plugin">
      <div className="min-w-0">
        <p className="m-0 text-control font-semibold text-primary">{pluginRequestTitle(request)}</p>
        <p className="mt-0.5 mb-0 text-support text-secondary">{connection.isPending ? "O Bot continua assim que a Conta conectar." : pluginRequestDetail(request)}</p>
        {failure && <p className="mt-1 mb-0 text-support text-status-error">Falha ao conectar: {failure}</p>}
      </div>
      <PluginStepView step={connection.step} />
      <div className="flex flex-wrap items-center gap-2">
        {request.accounts.map((account) => account.state === "connected"
          ? <Button key={account.id} variant="secondary" type="button" disabled={busy} onClick={() => decide({ botId, requestId: request.id, accountId: account.id })}>{account.label}</Button>
          : <Button key={account.id} variant="secondary" type="button" disabled={busy || !request.connectable} onClick={() => connection.connect({ pluginId: request.pluginId, accountId: account.id, botId, requestId: request.id })}>{connection.connecting?.accountId === account.id ? pluginStepLabel(connection.step) : `${account.label} · ${accountStateLabels[account.state]}`}</Button>)}
        {request.connectable && <Button type="button" disabled={busy} onClick={() => connection.connect({ pluginId: request.pluginId, botId, requestId: request.id })}>{connection.isPending && !connection.connecting?.accountId ? pluginStepLabel(connection.step) : connectLabel}</Button>}
        <Button className="ml-auto" variant="text" type="button" disabled={deciding} onClick={() => decide({ botId, requestId: request.id, accountId: null })}>Cancelar</Button>
      </div>
    </section>
  )
}
