import { BoltIcon, PauseIcon, PencilIcon, PlayIcon, TrashIcon } from "@heroicons/react/24/outline"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import type { Bot } from "@src/shared/bots"
import type { Trigger } from "@src/shared/triggers"
import type { EngineClient } from "../engine-client"
import { Button } from "../ui/button"
import { ConfirmationDialog } from "../ui/dialog"
import { IconButton } from "../ui/icon-button"
import { SettingsSection } from "../ui/settings-section"
import { useEscape } from "../ui/use-escape"
import { BotPage, BotPageIdentity } from "./bot-page"

import { triggerActionLabels, triggerEvents } from "./trigger-options"

function describe(trigger: Trigger) {
  const event = `${triggerEvents.find((option) => option.value === trigger.event)?.label} · ${trigger.actions.map((action) => triggerActionLabels[action] ?? action).join(", ")}`
  const repositories = trigger.repositories.map((repository) => repository.fullName).join(", ")

  return `${event} em ${repositories}`
}

export function BotTriggers({ bot, client, onClose, onEdit }: { bot: Bot; client: EngineClient; onClose: () => void; onEdit: (id: string) => void }) {
  const queryClient = useQueryClient()
  const [removingTrigger, setRemovingTrigger] = useState<Trigger>()
  const listOptions = client.query.triggers.list.queryOptions({ input: { botId: bot.id } })
  const { data: triggers, error: listError } = useQuery(listOptions)
  const refresh = () => void queryClient.invalidateQueries({ queryKey: listOptions.queryKey })
  const { mutate: update, isPending: updating, error: updateError } = useMutation(client.query.triggers.update.mutationOptions({ onSuccess: refresh }))
  const { mutate: remove, isPending: removing, error: removeError } = useMutation(client.query.triggers.remove.mutationOptions({ onSuccess() {
    refresh()
    setRemovingTrigger(undefined)
  } }))
  const busy = updating || removing
  const failure = listError?.message ?? updateError?.message ?? removeError?.message
  useEscape(onClose)

  function toggle(trigger: Trigger) {
    update({ id: trigger.id, name: trigger.name, event: trigger.event, actions: trigger.actions, repositories: trigger.repositories, labels: trigger.labels, instruction: trigger.instruction, includeOwnEvents: trigger.includeOwnEvents, status: trigger.status === "active" ? "paused" : "active" })
  }

  return (
    <BotPage label={`Gatilhos de ${bot.name}`}>
      <BotPageIdentity bot={bot} />
      <SettingsSection title="Gatilhos">
        {triggers?.length === 0 && <p className="m-0 text-support text-muted">Nenhum Gatilho. Peça a {bot.name} para agir quando algo acontecer no GitHub.</p>}
        {triggers && triggers.length > 0 && (
          <ul className="m-0 flex list-none flex-col divide-y divide-outline p-0">
            {triggers.map((trigger) => (
              <li className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0" key={trigger.id}>
                <BoltIcon className={`mt-0.5 size-4 shrink-0 ${trigger.status === "active" ? "text-primary" : "text-muted"}`} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className={`m-0 text-control font-medium ${trigger.status === "active" ? "text-primary" : "text-muted"}`}>{trigger.name}</p>
                  <p className="m-0 text-support text-muted">{describe(trigger)}{trigger.status === "paused" ? " · pausado" : ""}</p>
                  <p className="m-0 mt-1 line-clamp-2 whitespace-pre-wrap text-support text-secondary">{trigger.instruction}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <IconButton iconSize={14} size={28} type="button" disabled={busy} label={trigger.status === "active" ? "Pausar Gatilho" : "Ativar Gatilho"} onClick={() => toggle(trigger)}>{trigger.status === "active" ? <PauseIcon aria-hidden="true" /> : <PlayIcon aria-hidden="true" />}</IconButton>
                  <IconButton iconSize={14} size={28} type="button" disabled={busy} label="Editar Gatilho" onClick={() => onEdit(trigger.id)}><PencilIcon aria-hidden="true" /></IconButton>
                  <IconButton iconSize={14} size={28} type="button" disabled={busy} label="Remover Gatilho" onClick={() => setRemovingTrigger(trigger)}><TrashIcon aria-hidden="true" /></IconButton>
                </div>
              </li>
            ))}
          </ul>
        )}
        {failure && <p className="m-0 text-support text-status-error">Falha nos Gatilhos: {failure}</p>}
      </SettingsSection>
      {removingTrigger && (
        <ConfirmationDialog
          icon={<BoltIcon />}
          title="Remover Gatilho"
          onClose={() => !removing && setRemovingTrigger(undefined)}
          actions={(
            <>
              <Button variant="text" type="button" autoFocus disabled={removing} onClick={() => setRemovingTrigger(undefined)}>Cancelar</Button>
              <Button variant="danger" type="button" disabled={removing} onClick={() => remove({ id: removingTrigger.id })}>{removing ? "Removendo..." : "Remover Gatilho"}</Button>
            </>
          )}
        >
          <p className="m-0 text-control text-secondary">{bot.name} não será mais chamado por “{removingTrigger.name}”. Não é possível desfazer.</p>
        </ConfirmationDialog>
      )}
    </BotPage>
  )
}
