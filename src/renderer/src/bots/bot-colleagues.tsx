import { XMarkIcon } from "@heroicons/react/24/outline"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { Bot } from "../../../shared/bots"
import type { ProjectGroups } from "../../../shared/projects"
import type { EngineClient } from "../engine-client"
import { IconButton } from "../ui/icon-button"
import { SettingsSection, settingsPanelClassName } from "../ui/settings-section"
import { teamLeaders } from "./team"

export function colleaguesOf(groups: ProjectGroups | undefined, bot: Pick<Bot, "colleagueIds">) {
  const leaders = teamLeaders(groups)

  return bot.colleagueIds.flatMap((colleagueId) => leaders.filter((candidate) => candidate.id === colleagueId))
}

export function BotColleagueList({ bot, colleagues, busy, onRevoke }: { bot: Pick<Bot, "name">; colleagues: Bot[]; busy: boolean; onRevoke: (colleagueBotId: string) => void }) {
  if (colleagues.length === 0) {
    return <p className="m-0 text-support text-muted">Nenhum Colega. Mencione um Bot com @ na conversa para apresentá-lo a {bot.name}.</p>
  }

  return (
    <ul className="m-0 flex list-none flex-col divide-y divide-outline p-0">
      {colleagues.map((colleague) => (
        <li className="flex items-center gap-2 py-2.5 first:pt-0 last:pb-0" key={colleague.id}>
          <div className="min-w-0 flex-1">
            <p className="m-0 truncate text-control font-medium text-primary">{colleague.name}</p>
            <p className="m-0 truncate text-support text-muted">{colleague.function.outcome}</p>
          </div>
          <IconButton iconSize={14} size={28} type="button" disabled={busy} label={`Revogar ${colleague.name}`} onClick={() => onRevoke(colleague.id)}><XMarkIcon aria-hidden="true" /></IconButton>
        </li>
      ))}
    </ul>
  )
}

export function BotColleagues({ bot, client, groups }: { bot: Bot; client: EngineClient; groups: ProjectGroups | undefined }) {
  const queryClient = useQueryClient()
  const { mutate: revoke, isPending, error } = useMutation(client.query.bots.removeColleague.mutationOptions({
    onSuccess() {
      queryClient.invalidateQueries({ queryKey: client.query.projects.list.queryOptions().queryKey })
    },
  }))

  return (
    <SettingsSection title="Colegas">
      <div className={`${settingsPanelClassName} flex flex-col gap-4`}>
        <p className="m-0 text-support text-muted">{bot.name} pode abrir uma Tarefa para estes Bots. Cada um segue a própria Permissão.</p>
        <BotColleagueList bot={bot} colleagues={colleaguesOf(groups, bot)} busy={isPending} onRevoke={(colleagueBotId) => revoke({ botId: bot.id, colleagueBotId })} />
        {error && <p className="m-0 text-support text-status-error">Falha nos Colegas: {error.message}</p>}
      </div>
    </SettingsSection>
  )
}
