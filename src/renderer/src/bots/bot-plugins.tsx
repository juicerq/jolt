import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { Bot } from "../../../shared/bots"
import type { Plugin } from "../../../shared/plugins"
import type { EngineClient } from "../engine-client"
import { PluginAccountRow } from "../plugins/plugin-account-row"
import { Switch } from "../ui/switch"
import { BotSettingsSection } from "./bot-settings-section"

export function pluginsWithAccounts(plugins: Plugin[]) {
  return plugins.filter((plugin) => plugin.accounts.length > 0)
}

export function BotPluginList({ bot, plugins, busy, onGrant }: { bot: Pick<Bot, "id">; plugins: Plugin[]; busy: boolean; onGrant: (pluginId: string, accountId: string | null) => void }) {
  const listed = pluginsWithAccounts(plugins)

  if (listed.length === 0) {
    return <p className="m-0 text-support text-muted">Nenhuma Conta conectada ainda. Peça ao Bot na conversa ou conecte na tela de Plugins.</p>
  }

  return (
    <div className="flex flex-col gap-4">
      {listed.map((plugin) => (
        <div className="flex flex-col gap-2" key={plugin.id}>
          <p className="m-0 text-control font-semibold text-secondary">{plugin.name}</p>
          <ul className="m-0 flex list-none flex-col divide-y divide-outline p-0">
            {plugin.accounts.map((account) => {
              const granted = account.botIds.includes(bot.id)

              return <PluginAccountRow key={account.id} account={account} actions={<Switch checked={granted} disabled={busy} aria-label={`Usar ${account.label}`} onChange={(checked) => onGrant(plugin.id, checked ? account.id : null)} />} />
            })}
          </ul>
        </div>
      ))}
    </div>
  )
}

export function BotPlugins({ bot, client }: { bot: Bot; client: EngineClient }) {
  const queryClient = useQueryClient()
  const { data, error: listError } = useQuery(client.query.plugins.list.queryOptions())
  const { mutate: grant, isPending, error: grantError } = useMutation(client.query.plugins.grant.mutationOptions({
    onSuccess() {
      queryClient.invalidateQueries({ queryKey: client.query.plugins.list.queryOptions().queryKey })
    },
  }))
  const failure = listError?.message ?? grantError?.message

  return (
    <BotSettingsSection title="Plugins">
      <p className="m-0 text-support text-muted">{bot.temporary ? `Um Integrante temporário usa só as Contas que o Líder passou ao contratar.` : `${bot.name} usa uma Conta por Plugin. A Permissão do Bot vale para essas ferramentas também.`}</p>
      {data && <BotPluginList bot={bot} plugins={data.plugins} busy={isPending || bot.temporary} onGrant={(pluginId, accountId) => grant({ botId: bot.id, pluginId, accountId })} />}
      {failure && <p className="m-0 text-support text-status-error">Falha nos Plugins: {failure}</p>}
    </BotSettingsSection>
  )
}
