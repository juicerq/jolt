import { PlusIcon, XMarkIcon } from "@heroicons/react/24/outline"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import type { Plugin, PluginAccount } from "@src/shared/plugins"
import { closeWorkspaceScreen } from "../bots/bots-store"
import { ChatEdgeTab } from "../chat/chat-edge-tab"
import type { EngineClient } from "../engine-client"
import { Button } from "../ui/button"
import { IconButton } from "../ui/icon-button"
import { useEscape } from "../ui/use-escape"
import { BotPage } from "../bots/bot-page"
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
      <BotPage label="Plugins">
        <header className="flex items-center justify-between gap-4 max-md:flex-col max-md:items-start">
          <div className="min-w-0">
            <h2 className="m-0 text-title font-semibold text-primary max-md:hidden">Plugins</h2>
            <p className="m-0 mt-1 text-support text-muted">Conecte suas contas e escolha quem pode usá-las nas configurações de cada Bot.</p>
          </div>
          <Button className="inline-flex items-center gap-2" variant="secondary" type="button" onClick={() => setAdding(true)}><PlusIcon className="size-4" aria-hidden="true" />Adicionar Plugin</Button>
        </header>
        {error && <p className="m-0 text-support text-status-error">Falha ao carregar Plugins: {error.message}</p>}
        {isPending && <p className="m-0 text-support text-muted">Carregando Plugins...</p>}
        {data && data.plugins.map((plugin) => <PluginCard key={plugin.id} plugin={plugin} client={client} />)}
      </BotPage>
      <ChatEdgeTab>
        <IconButton iconSize={16} type="button" label="Fechar Plugins" tooltipPlacement="left" onClick={closeWorkspaceScreen}><XMarkIcon aria-hidden="true" /></IconButton>
      </ChatEdgeTab>
      {adding && <AddPluginDialog client={client} onClose={() => setAdding(false)} />}
    </>
  )
}

type PluginConnection = ReturnType<typeof useConnectPlugin>

function PluginCard({ plugin, client }: { plugin: Plugin; client: EngineClient }) {
  const queryClient = useQueryClient()
  const [confirmingRemoval, setConfirmingRemoval] = useState(false)
  const refresh = () => queryClient.invalidateQueries({ queryKey: client.query.plugins.key() })
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
        {plugin.builtIn && plugin.available && <PluginConnectButton connection={connection} disabled={busy} pluginId={plugin.id}>Conectar</PluginConnectButton>}
        {!plugin.builtIn && !confirmingRemoval && <Button variant="text" type="button" disabled={busy} onClick={() => setConfirmingRemoval(true)}>Remover</Button>}
      </div>
      <PluginStepView step={connection.step} />
      {plugin.accounts.length > 0 && (
        <ul className="m-0 flex list-none flex-col divide-y divide-outline p-0">
          {plugin.accounts.map((account) => (
            <PluginAccountRow key={account.id} account={account} actions={<PluginAccountActions account={account} busy={busy} connection={connection} plugin={plugin} onDisconnect={() => disconnect({ accountId: account.id })} />} />
          ))}
        </ul>
      )}
      {confirmingRemoval && <PluginRemoval pluginName={plugin.name} removing={removing} onCancel={() => setConfirmingRemoval(false)} onConfirm={() => remove({ id: plugin.id })} />}
      {failure && <p className="m-0 text-support text-status-error">Falha no Plugin: {failure}</p>}
    </section>
  )
}

function PluginConnectButton({ accountId, children, connection, disabled, pluginId }: { accountId?: string; children: string; connection: PluginConnection; disabled: boolean; pluginId: string }) {
  const connecting = connection.isPending && connection.connecting?.accountId === accountId

  return <Button variant="secondary" type="button" disabled={disabled} onClick={() => connection.connect({ pluginId, ...(accountId ? { accountId } : {}) })}>{connecting ? pluginStepLabel(connection.step) : children}</Button>
}

function PluginAccountActions({ account, busy, connection, onDisconnect, plugin }: { account: Pick<PluginAccount, "id" | "state">; busy: boolean; connection: PluginConnection; onDisconnect: () => void; plugin: Pick<Plugin, "id" | "builtIn" | "available"> }) {
  return (
    <>
      {account.state !== "connected" && plugin.builtIn && plugin.available && <PluginConnectButton accountId={account.id} connection={connection} disabled={busy} pluginId={plugin.id}>Reconectar</PluginConnectButton>}
      {plugin.builtIn && <Button variant="text" type="button" disabled={busy} onClick={onDisconnect}>Desconectar</Button>}
    </>
  )
}

function PluginRemoval({ onCancel, onConfirm, pluginName, removing }: { onCancel: () => void; onConfirm: () => void; pluginName: string; removing: boolean }) {
  return (
    <div className="flex flex-col items-start gap-3">
      <p className="m-0 text-control font-medium text-secondary">Remover {pluginName} encerra o acesso dos Bots e apaga as variáveis de ambiente salvas.</p>
      <div className="flex gap-2">
        <Button variant="text" type="button" autoFocus disabled={removing} onClick={onCancel}>Cancelar</Button>
        <Button variant="danger" type="button" disabled={removing} onClick={onConfirm}>{removing ? "Removendo..." : "Remover Plugin"}</Button>
      </div>
    </div>
  )
}

function describePlugin(plugin: Pick<Plugin, "available" | "unavailableReason" | "config" | "accounts">) {
  if (!plugin.available) {
    return plugin.unavailableReason ?? "Indisponível"
  }

  if (plugin.config) {
    return `Servidor MCP · ${plugin.config.command}`
  }

  if (plugin.accounts.length === 0) {
    return "Nenhuma Conta conectada"
  }

  if (plugin.accounts.length === 1) {
    return "1 Conta conectada"
  }

  return `${plugin.accounts.length} Contas conectadas`
}
