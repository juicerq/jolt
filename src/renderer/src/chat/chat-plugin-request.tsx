import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { PluginRequest, PluginStep } from "@src/shared/plugins"
import type { EngineClient } from "../engine-client"
import { accountStateLabels } from "../plugins/account-states"
import { PluginStepView } from "../plugins/plugin-step"
import { Button } from "../ui/button"

function pluginRequestTitle(request: Pick<PluginRequest, "pluginName" | "accounts" | "target">) {
  if (request.target) {
    return `Liberar acesso a ${request.target}`
  }

  const reconnecting = request.accounts.length > 0 && request.accounts.every((account) => account.state !== "connected")

  if (reconnecting) {
    return `Reconectar ${request.pluginName}`
  }

  return `Conectar ${request.pluginName}`
}

function connectingDetail(step: PluginStep | undefined) {
  if (step?.type === "status") {
    return step.message
  }

  if (step?.type === "qr") {
    return "O Bot continuará após a leitura do código."
  }

  if (step?.type === "browser") {
    return "Entre na sua conta pelo navegador para o Bot continuar."
  }

  return "Conectando..."
}

function pluginRequestDetail(request: Pick<PluginRequest, "pluginName" | "accounts" | "connectable" | "target">) {
  if (request.target) {
    return "Autorize no GitHub para o Bot verificar o repositório e continuar."
  }

  if (request.accounts.length > 0) {
    return `Escolha a conta que o Bot poderá usar.`
  }

  if (!request.connectable) {
    return `${request.pluginName} não está configurado neste computador.`
  }

  return `O Bot precisa de uma Conta de ${request.pluginName}.`
}

export function ChatPluginRequest({ botId, client, request, step }: { botId: string; client: EngineClient; request: PluginRequest; step: PluginStep | undefined }) {
  const queryClient = useQueryClient()
  const { mutate: connect, isPending: connecting, error: connectError } = useMutation(client.query.plugins.connect.mutationOptions())
  const { mutate: decide, isPending: deciding, error: decideError } = useMutation(client.query.plugins.decide.mutationOptions({
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: client.query.plugins.list.queryOptions().queryKey })
    },
  }))
  const busy = connecting || deciding
  const failure = connectError?.message ?? decideError?.message
  const connectLabel = request.target ? "Autorizar no GitHub" : "Conectar outra conta"
  const detail = request.connecting ? connectingDetail(step) : pluginRequestDetail(request)

  return (
    <section className="flex min-w-0 flex-col gap-3" aria-label="Pedido de Plugin">
      <div className="min-w-0">
        <p className="m-0 text-control font-semibold text-primary">{pluginRequestTitle(request)}</p>
        <p className="mt-0.5 mb-0 text-support text-secondary">{detail}</p>
        {failure && <p className="mt-1 mb-0 text-support text-status-error">Falha ao conectar: {failure}</p>}
      </div>
      <PluginStepView step={step} />
      <div className="flex flex-wrap items-center gap-2">
        {!request.connecting && request.accounts.map((account) => account.state === "connected"
          ? <Button key={account.id} variant="secondary" type="button" disabled={busy} onClick={() => decide({ botId, requestId: request.id, accountId: account.id })}>{account.label}</Button>
          : <Button key={account.id} variant="secondary" type="button" disabled={busy || !request.connectable} onClick={() => connect({ pluginId: request.pluginId, accountId: account.id, botId, requestId: request.id })}>{`${account.label} · ${accountStateLabels[account.state]}`}</Button>)}
        {!request.connecting && request.connectable && <Button type="button" disabled={busy} onClick={() => connect({ pluginId: request.pluginId, botId, requestId: request.id })}>{request.accounts.length > 0 || request.target ? connectLabel : "Conectar"}</Button>}
        <Button className="ml-auto" variant="text" type="button" disabled={deciding} onClick={() => decide({ botId, requestId: request.id, accountId: null })}>Cancelar</Button>
      </div>
    </section>
  )
}
