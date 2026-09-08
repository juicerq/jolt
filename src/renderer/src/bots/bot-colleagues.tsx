import { XMarkIcon } from "@heroicons/react/24/outline"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { Bot } from "@src/shared/bots"
import type { ProjectGroups } from "@src/shared/projects"
import type { EngineClient } from "../engine-client"
import { IconButton } from "../ui/icon-button"
import { SettingsSection, settingsPanelClassName } from "../ui/settings-section"
import { teamLeaders } from "./team"

function colleaguesOf(groups: ProjectGroups | undefined, bot: Pick<Bot, "colleagueIds">) {
  const leaders = teamLeaders(groups)

  return bot.colleagueIds.flatMap((colleagueId) => leaders.filter((candidate) => candidate.id === colleagueId))
}

export function BotColleagues({ bot, client, groups }: { bot: Bot; client: EngineClient; groups: ProjectGroups | undefined }) {
  const colleagues = colleaguesOf(groups, bot)
  const queryClient = useQueryClient()
  const { mutate: revoke, isPending, error } = useMutation(client.query.bots.removeColleague.mutationOptions({
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: client.query.projects.key() })
    },
  }))

  return (
    <SettingsSection title="Colegas">
      <div className={`${settingsPanelClassName} flex flex-col gap-4`}>
        <p className="m-0 text-support font-normal text-muted">
          {colleagues.length === 0
            ? `Mencione um Bot com @ na conversa para que ${bot.name} possa abrir Tarefas para ele.`
            : `${bot.name} pode abrir Tarefas para estes Bots, respeitando a Permissão de cada um.`}
        </p>
        {colleagues.length > 0 && (
          <ul className="m-0 flex list-none flex-col divide-y divide-outline p-0">
            {colleagues.map((colleague) => (
              <li className="flex items-center gap-2 py-2.5 first:pt-0 last:pb-0" key={colleague.id}>
                <div className="min-w-0 flex-1">
                  <p className="m-0 truncate text-control font-medium text-primary">{colleague.name}</p>
                  <p className="m-0 truncate text-support text-muted">{colleague.function.outcome}</p>
                </div>
                <IconButton iconSize={14} size={28} type="button" disabled={isPending} label={`Revogar ${colleague.name}`} onClick={() => revoke({ botId: bot.id, colleagueBotId: colleague.id })}><XMarkIcon aria-hidden="true" /></IconButton>
              </li>
            ))}
          </ul>
        )}
        {error && <p className="m-0 text-support text-status-error">Falha nos Colegas: {error.message}</p>}
      </div>
    </SettingsSection>
  )
}
