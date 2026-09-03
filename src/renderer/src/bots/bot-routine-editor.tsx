import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { type FormEvent, useState } from "react"
import type { Bot } from "../../../shared/bots"
import type { Frequency, Weekday } from "../../../shared/routines"
import { weekdays } from "../../../shared/weekdays"
import type { EngineClient } from "../engine-client"
import { Field, fieldControlClassName } from "../ui/field"
import { Select } from "../ui/select"
import { SettingsSection } from "../ui/settings-section"
import { ToggleChip } from "../ui/toggle-chip"
import { useEscape } from "../ui/use-escape"
import { BotPage, BotPageIdentity, BotPageSaveBar } from "./bot-page"
import { emptyRoutineDraft, frequencyForms, frequencyOf, routineDraftOf, type RoutineDraft } from "./routine-draft"
import { weekdayLabels } from "./routine-frequency"

export function BotRoutineEditor({ bot, client, routineId, onClose }: { bot: Bot; client: EngineClient; routineId: "new" | string; onClose: () => void }) {
  const creating = routineId === "new"
  const queryClient = useQueryClient()
  const listOptions = client.query.routines.list.queryOptions({ input: { botId: bot.id } })
  const { data: routines, error: listError, isPending } = useQuery(listOptions)
  const routine = creating ? undefined : routines?.find((candidate) => candidate.id === routineId)
  const settled = { onSuccess() {
    queryClient.invalidateQueries({ queryKey: listOptions.queryKey })
    onClose()
  } }
  const { mutate: create, isPending: creatingRoutine, error: createError } = useMutation(client.query.routines.create.mutationOptions(settled))
  const { mutate: update, isPending: updating, error: updateError } = useMutation(client.query.routines.update.mutationOptions(settled))
  useEscape(onClose)

  if (!creating && isPending) {
    return (
      <BotPage label={`Editar Rotina de ${bot.name}`}>
        <BotPageIdentity bot={bot} />
        <p className="m-0 text-support text-muted">Carregando Rotina...</p>
      </BotPage>
    )
  }

  if (!creating && !routine) {
    return (
      <BotPage label={`Editar Rotina de ${bot.name}`}>
        <BotPageIdentity bot={bot} />
        <p className="m-0 text-support text-status-error">{listError ? `Falha nas Rotinas: ${listError.message}` : "Esta Rotina não existe mais."}</p>
      </BotPage>
    )
  }

  function handleSave(name: string, content: string, frequency: Frequency) {
    if (creating) {
      create({ botId: bot.id, name, content, frequency })
      return
    }

    if (!routine) {
      return
    }

    update({ id: routine.id, name, content, frequency, status: routine.status === "completed" || routine.status === "failed" ? "active" : routine.status })
  }

  return <RoutineForm bot={bot} creating={creating} initial={routine ? routineDraftOf(routine) : emptyRoutineDraft} pending={creatingRoutine || updating} failure={createError?.message ?? updateError?.message} submitLabel={creating ? "Adicionar Rotina" : "Salvar Rotina"} onClose={onClose} onSubmit={handleSave} />
}

function RoutineForm({ bot, creating, initial, pending, failure, submitLabel, onClose, onSubmit }: { bot: Bot; creating: boolean; initial: RoutineDraft; pending: boolean; failure?: string; submitLabel: string; onClose: () => void; onSubmit: (name: string, content: string, frequency: Frequency) => void }) {
  const [draft, setDraft] = useState(initial)
  const content = draft.content.trim()
  const name = draft.name.trim()
  const frequency = frequencyOf(draft)
  const complete = !!name && !!content && !!frequency
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial)
  const footer = creating || dirty
    ? <BotPageSaveBar form="routine-editor" complete={complete} saving={pending} {...(failure ? { failure: `Falha na Rotina: ${failure}` } : {})} saveLabel={submitLabel} onDiscard={creating ? onClose : () => setDraft(initial)} />
    : undefined

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!name || !content || !frequency) {
      return
    }

    onSubmit(name, content, frequency)
  }

  function toggleDay(day: Weekday) {
    const days = draft.days.includes(day) ? draft.days.filter((chosen) => chosen !== day) : weekdays.filter((chosen) => chosen === day || draft.days.includes(chosen))
    setDraft({ ...draft, days })
  }

  return (
    <BotPage label={`${submitLabel} de ${bot.name}`} footer={footer}>
      <BotPageIdentity bot={bot} />
      <form className="flex flex-col gap-8" id="routine-editor" onSubmit={handleSubmit}>
        <SettingsSection title="Rotina">
          <Field label="Nome"><input className={fieldControlClassName} autoFocus placeholder="Verificação comercial" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></Field>
          <Field label="Pedido"><textarea className={`${fieldControlClassName} field-sizing-content max-h-40 min-h-20 resize-none font-normal`} placeholder="Verifique a caixa de entrada e me avise do que precisa de resposta" rows={3} value={draft.content} onChange={(event) => setDraft({ ...draft, content: event.target.value })} /></Field>
          <Field label="Frequência" as="div">
            <div className="grid grid-cols-1 gap-2 min-[1000px]:grid-cols-[1fr_auto]">
              <label>
                <span className="sr-only">Forma da Frequência</span>
                <Select value={draft.form} onChange={(event) => setDraft({ ...draft, form: frequencyForms[event.target.value] ?? "interval" })}>
                  <option value="interval">A cada</option>
                  <option value="fixed-time">Nos dias</option>
                  <option value="once">Uma vez</option>
                </Select>
              </label>
              {draft.form === "interval" && <label className="flex items-center gap-2 text-control font-normal text-secondary"><span className="sr-only">Minutos</span><input className={`${fieldControlClassName} w-20`} type="number" min={1} step={1} value={draft.everyMinutes} onChange={(event) => setDraft({ ...draft, everyMinutes: event.target.value })} />minutos</label>}
              {draft.form === "fixed-time" && <label className="flex items-center gap-2 text-control font-normal text-secondary"><span className="sr-only">Horários</span><input className={`${fieldControlClassName} w-44`} placeholder="09:00, 14:00" value={draft.times} onChange={(event) => setDraft({ ...draft, times: event.target.value })} /></label>}
              {draft.form === "once" && <label className="flex items-center gap-2 text-control font-normal text-secondary">em<span className="sr-only">Data e hora</span><input className={`${fieldControlClassName} w-48`} type="datetime-local" value={draft.at} onChange={(event) => setDraft({ ...draft, at: event.target.value })} /></label>}
            </div>
            {draft.form !== "once" && (
              <div className="flex gap-1" role="group" aria-label="Dias da semana">
                {weekdays.map((day) => <ToggleChip className="flex-1 px-0" pressed={draft.days.includes(day)} key={day} onClick={() => toggleDay(day)}>{weekdayLabels[day]}</ToggleChip>)}
              </div>
            )}
            {draft.form === "interval" && <div className="grid grid-cols-2 gap-2"><Field label="Das"><input className={fieldControlClassName} type="time" value={draft.startTime} onChange={(event) => setDraft({ ...draft, startTime: event.target.value })} /></Field><Field label="Até"><input className={fieldControlClassName} type="time" value={draft.endTime} onChange={(event) => setDraft({ ...draft, endTime: event.target.value })} /></Field></div>}
          </Field>
        </SettingsSection>
      </form>
    </BotPage>
  )
}
