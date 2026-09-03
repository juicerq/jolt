import { ChevronDownIcon, ClockIcon, PauseIcon, PencilIcon, PlayIcon, PlusIcon, TrashIcon } from "@heroicons/react/24/outline"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import type { Bot } from "../../../shared/bots"
import type { Routine } from "../../../shared/routines"
import type { EngineClient } from "../engine-client"
import { Button } from "../ui/button"
import { ConfirmationDialog } from "../ui/dialog"
import { IconButton } from "../ui/icon-button"
import { SettingsSection } from "../ui/settings-section"
import { useEscape } from "../ui/use-escape"
import { BotPage, BotPageIdentity } from "./bot-page"
import { describeFrequency } from "./routine-frequency"

export function BotRoutines({ bot, client, onClose, onCreate, onEdit }: { bot: Bot; client: EngineClient; onClose: () => void; onCreate: () => void; onEdit: (id: string) => void }) {
  const [removingRoutine, setRemovingRoutine] = useState<Routine>()
  const queryClient = useQueryClient()
  const listOptions = client.query.routines.list.queryOptions({ input: { botId: bot.id } })
  const { data: routines, error: listError } = useQuery(listOptions)
  const refresh = () => queryClient.invalidateQueries({ queryKey: listOptions.queryKey })
  const settled = { onSuccess() {
    refresh()
  } }
  const { mutate: update, isPending: updating, error: updateError } = useMutation(client.query.routines.update.mutationOptions(settled))
  const { mutate: remove, isPending: removing, error: removeError } = useMutation(client.query.routines.remove.mutationOptions({ onSuccess() {
    refresh()
    setRemovingRoutine(undefined)
  } }))
  const failure = listError?.message ?? updateError?.message ?? removeError?.message
  const busy = updating || removing
  useEscape(onClose)

  return (
    <BotPage label={`Rotinas de ${bot.name}`}>
      <BotPageIdentity bot={bot} />
      <SettingsSection title="Rotinas">
        {routines?.length === 0 && <p className="m-0 text-support text-muted">Nenhuma Rotina. {bot.name} só trabalha quando você chama.</p>}
        {routines && routines.length > 0 && (
          <ul className="m-0 flex list-none flex-col divide-y divide-outline p-0">
            {routines.map((routine) => (
              <li className="flex items-center gap-2 py-2.5 first:pt-0" key={routine.id}>
                <div className="min-w-0 flex-1">
                  <p className={`m-0 text-control font-medium ${routine.status === "active" ? "text-primary" : "text-muted"}`}>{routine.name}</p>
                  <p className="m-0 text-support text-muted">{describeFrequency(routine.frequency)}{routine.status === "paused" ? " · pausada" : routine.status === "completed" ? " · concluída" : routine.status === "failed" ? " · falhou" : ""}</p>
                  <details className="group mt-1 text-support text-secondary">
                    <summary className="-mx-2 flex cursor-pointer list-none items-start gap-2 rounded-lg px-2 py-1 hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                      <span className="line-clamp-2 min-w-0 flex-1 whitespace-pre-wrap group-open:line-clamp-none">{routine.content}</span>
                      <ChevronDownIcon className="mt-0.5 size-3.5 flex-none text-muted transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
                    </summary>
                  </details>
                </div>
                {(routine.status === "active" || routine.status === "paused") && <IconButton iconSize={14} size={28} type="button" disabled={busy} label={routine.status === "active" ? "Pausar Rotina" : "Retomar Rotina"} onClick={() => update({ id: routine.id, name: routine.name, content: routine.content, frequency: routine.frequency, status: routine.status === "active" ? "paused" : "active" })}>{routine.status === "active" ? <PauseIcon aria-hidden="true" /> : <PlayIcon aria-hidden="true" />}</IconButton>}
                <IconButton iconSize={14} size={28} type="button" disabled={busy} label="Editar Rotina" onClick={() => onEdit(routine.id)}><PencilIcon aria-hidden="true" /></IconButton>
                <IconButton iconSize={14} size={28} type="button" disabled={busy} label="Remover Rotina" onClick={() => setRemovingRoutine(routine)}><TrashIcon aria-hidden="true" /></IconButton>
              </li>
            ))}
          </ul>
        )}
        <Button className="inline-flex items-center gap-2 self-start" variant="secondary" type="button" disabled={busy} onClick={onCreate}><PlusIcon className="size-4" aria-hidden="true" />Nova Rotina</Button>
        {failure && <p className="m-0 text-support text-status-error">Falha nas Rotinas: {failure}</p>}
      </SettingsSection>
      {removingRoutine && (
        <ConfirmationDialog
          icon={<ClockIcon />}
          title="Remover Rotina"
          onClose={() => !removing && setRemovingRoutine(undefined)}
          actions={(
            <>
            <Button variant="text" type="button" autoFocus disabled={removing} onClick={() => setRemovingRoutine(undefined)}>Cancelar</Button>
            <Button variant="danger" type="button" disabled={removing} onClick={() => remove({ id: removingRoutine.id })}>{removing ? "Removendo..." : "Remover Rotina"}</Button>
            </>
          )}
        >
          <p className="m-0 text-control text-secondary">Remover “{removingRoutine.name}” cancela todas as execuções futuras. Não é possível desfazer.</p>
          {removeError && <p className="m-0 text-support text-status-error">Falha ao remover a Rotina: {removeError.message}</p>}
        </ConfirmationDialog>
      )}
    </BotPage>
  )
}
