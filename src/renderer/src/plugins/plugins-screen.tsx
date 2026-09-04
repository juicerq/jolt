import { PlusIcon, XMarkIcon } from "@heroicons/react/24/outline"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import type { Plugin } from "@src/shared/plugins"
import { closeWorkspaceScreen } from "../bots/bots-store"
import { ChatEdgeTab } from "../chat/chat-edge-tab"
import type { EngineClient } from "../engine-client"
import { Button } from "../ui/button"
import { IconButton } from "../ui/icon-button"
import { useEscape } from "../ui/use-escape"
import { AddPluginDialog } from "./add-plugin-dialog"
import { PluginAccountRow } from "./plugin-account-row"
import { useConnectPlugin } from "./plugin-connection"
import { PluginStepView, pluginStepLabel } from "./plugin-step"

export function PluginsScreen({ client }: { client: EngineClient }) {
  const [adding, setAdding] = useState(false)
  const { data, error, isPending } = useQuery(client.query.plugins.list.queryOptions())
  useEscape(closeWorkspaceScreen)

  return (
    <>
      <section className="flex h-full min-h-0 flex-col overflow-y-auto bg-surface" aria-label="Plugins">
        <div className="mx-auto flex w-[min(560px,calc(100%-48px))] flex-1 flex-col gap-8 pt-12 pb-12">
          <header className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h2 className="m-0 text-title font-semibold text-primary">Plugins</h2>
              <p className="m-0 mt-1 text-support text-muted">Contas que os Bots podem usar. Cada Bot escolhe as suas nas configurações.</p>
            </div>
            <Button className="inline-flex items-center gap-2" variant="secondary" type="button" onClick={() => setAdding(true)}><PlusIcon className="size-4" aria-hidden="true" />Adicionar Plugin</Button>
          </header>
          {error && <p className="m-0 text-support text-status-error">Falha ao carregar Plugins: {error.message}</p>}
          {isPending && <p className="m-0 text-support text-muted">Carregando Plugins...</p>}
          {data && data.plugins.map((plugin) => <PluginCard key={plugin.id} plugin={plugin} client={client} />)}
        </div>
      </section>
      <ChatEdgeTab>
        <IconButton iconSize={16} type="button" label="Fechar Plugins" tooltipPlacement="left" onClick={closeWorkspaceScreen}><XMarkIcon aria-hidden="true" /></IconButton>
      </ChatEdgeTab>
      {adding && <AddPluginDialog client={client} onClose={() => setAdding(false)} />}
    </>
  )
}

export function PluginCard({ plugin, client }: { plugin: Plugin; client: EngineClient }) {
  const queryClient = useQueryClient()
  const [confirmingRemoval, setConfirmingRemoval] = useState(false)
  const refresh = () => queryClient.invalidateQueries({ queryKey: client.query.plugins.list.queryOptions().queryKey })
  const connection = useConnectPlugin(client)
  const { mutate: disconnect, isPending: disconnecting, error: disconnectError } = useMutation(client.query.plugins.disconnect.mutationOptions({ onSuccess: refresh }))
  const { mutate: remove, isPending: removing, error: removeError } = useMutation(client.query.plugins.remove.mutationOptions({ onSuccess: refresh }))
  const busy = connection.isPending || disconnecting || removing
  const failure = connection.error?.message ?? disconnectError?.message ?? removeError?.message

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-outline bg-surface-raised p-5" aria-label={plugin.name}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="m-0 text-section font-semibold text-primary">{plugin.name}</h3>
          <p className="m-0 text-support text-muted">{describePlugin(plugin)}</p>
        </div>
        {plugin.builtIn && plugin.available && <Button variant="secondary" type="button" disabled={busy} onClick={() => connection.connect({ pluginId: plugin.id })}>{connection.isPending && !connection.connecting?.accountId ? pluginStepLabel(connection.step) : "Conectar"}</Button>}
        {!plugin.builtIn && !confirmingRemoval && <Button variant="text" type="button" disabled={busy} onClick={() => setConfirmingRemoval(true)}>Remover</Button>}
      </div>
      <PluginStepView step={connection.step} />
      {plugin.accounts.length > 0 && (
        <ul className="m-0 flex list-none flex-col divide-y divide-outline p-0">
          {plugin.accounts.map((account) => (
            <PluginAccountRow key={account.id} account={account} actions={(
              <>
                {account.state !== "connected" && plugin.builtIn && plugin.available && <Button variant="secondary" type="button" disabled={busy} onClick={() => connection.connect({ pluginId: plugin.id, accountId: account.id })}>{connection.connecting?.accountId === account.id ? pluginStepLabel(connection.step) : "Reconectar"}</Button>}
                {plugin.builtIn && <Button variant="text" type="button" disabled={busy} onClick={() => disconnect({ accountId: account.id })}>Desconectar</Button>}
              </>
            )} />
          ))}
        </ul>
      )}
      {confirmingRemoval && (
        <div className="flex flex-col items-start gap-3">
          <p className="m-0 text-control font-medium text-secondary">Remover {plugin.name} tira o acesso de {plugin.accounts.reduce((count, account) => count + account.botIds.length, 0)} Bot(s) e apaga as variáveis guardadas.</p>
          <div className="flex gap-2">
            <Button variant="text" type="button" autoFocus disabled={removing} onClick={() => setConfirmingRemoval(false)}>Cancelar</Button>
            <Button variant="danger" type="button" disabled={removing} onClick={() => remove({ id: plugin.id })}>{removing ? "Removendo..." : "Remover Plugin"}</Button>
          </div>
        </div>
      )}
      {failure && <p className="m-0 text-support text-status-error">Falha no Plugin: {failure}</p>}
    </section>
  )
}

export function describePlugin(plugin: Pick<Plugin, "kind" | "available" | "unavailableReason" | "config" | "accounts">) {
  if (!plugin.available) {
    return plugin.unavailableReason ?? "Indisponível"
  }

  if (plugin.kind === "mcp") {
    return `Servidor MCP · ${plugin.config?.command ?? ""}`
  }

  if (plugin.accounts.length === 0) {
    return "Nenhuma Conta conectada"
  }

  if (plugin.accounts.length === 1) {
    return "1 Conta conectada"
  }

  return `${plugin.accounts.length} Contas conectadas`
}
