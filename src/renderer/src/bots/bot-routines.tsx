import { PauseIcon, PencilIcon, PlayIcon, PlusIcon, TrashIcon } from "@heroicons/react/24/outline"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { Bot } from "../../../shared/bots"
import type { EngineClient } from "../engine-client"
import { Button } from "../ui/button"
import { IconButton } from "../ui/icon-button"
import { useEscape } from "../ui/use-escape"
import { BotPage, BotPageIdentity } from "./bot-page"
import { BotSettingsSection } from "./bot-settings-section"
import { describeFrequency } from "./routine-frequency"

export function BotRoutines({ bot, client, onClose, onCreate, onEdit }: { bot: Bot; client: EngineClient; onClose: () => void; onCreate: () => void; onEdit: (id: string) => void }) {
  const queryClient = useQueryClient()
  const listOptions = client.query.routines.list.queryOptions({ input: { botId: bot.id } })
  const { data: routines, error: listError } = useQuery(listOptions)
  const settled = { onSuccess() {
    queryClient.invalidateQueries({ queryKey: listOptions.queryKey })
  } }
  const { mutate: update, isPending: updating, error: updateError } = useMutation(client.query.routines.update.mutationOptions(settled))
  const { mutate: remove, isPending: removing, error: removeError } = useMutation(client.query.routines.remove.mutationOptions(settled))
  const failure = listError?.message ?? updateError?.message ?? removeError?.message
  const busy = updating || removing
  useEscape(onClose)

  return (
    <BotPage label={`Rotinas de ${bot.name}`}>
      <BotPageIdentity bot={bot} />
      <BotSettingsSection title="Rotinas">
        {routines?.length === 0 && <p className="m-0 text-support text-muted">Nenhuma Rotina. {bot.name} só trabalha quando você chama.</p>}
        {routines && routines.length > 0 && (
          <ul className="m-0 flex list-none flex-col divide-y divide-outline p-0">
            {routines.map((routine) => (
              <li className="flex items-center gap-2 py-2.5 first:pt-0" key={routine.id}>
                <div className="min-w-0 flex-1">
                  <p className={`m-0 text-control font-medium ${routine.status === "active" ? "text-primary" : "text-muted"}`}>{routine.name}</p>
                  <p className="m-0 text-support text-muted">{describeFrequency(routine.frequency)}{routine.status === "paused" ? " · pausada" : routine.status === "completed" ? " · concluída" : routine.status === "failed" ? " · falhou" : ""}</p>
                  <details className="mt-1 text-support text-secondary"><summary className="line-clamp-2 cursor-pointer list-none">{routine.content}</summary><p className="mb-0 mt-1 whitespace-pre-wrap">{routine.content}</p></details>
                </div>
                {(routine.status === "active" || routine.status === "paused") && <IconButton iconSize={14} size={28} type="button" disabled={busy} label={routine.status === "active" ? "Pausar Rotina" : "Retomar Rotina"} onClick={() => update({ id: routine.id, name: routine.name, content: routine.content, frequency: routine.frequency, status: routine.status === "active" ? "paused" : "active" })}>{routine.status === "active" ? <PauseIcon aria-hidden="true" /> : <PlayIcon aria-hidden="true" />}</IconButton>}
                <IconButton iconSize={14} size={28} type="button" disabled={busy} label="Editar Rotina" onClick={() => onEdit(routine.id)}><PencilIcon aria-hidden="true" /></IconButton>
                <IconButton iconSize={14} size={28} type="button" disabled={busy} label="Remover Rotina" onClick={() => {
                  if ((routine.status === "completed" || window.confirm("Remover a Rotina e todas as suas execuções futuras?"))) {
                    remove({ id: routine.id })
                  }
                }}><TrashIcon aria-hidden="true" /></IconButton>
              </li>
            ))}
          </ul>
        )}
        <Button className="inline-flex items-center gap-2 self-start" variant="secondary" type="button" disabled={busy} onClick={onCreate}><PlusIcon className="size-4" aria-hidden="true" />Nova Rotina</Button>
        {failure && <p className="m-0 text-support text-status-error">Falha nas Rotinas: {failure}</p>}
      </BotSettingsSection>
    </BotPage>
  )
}
