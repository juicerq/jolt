import { PauseIcon, PencilIcon, PlayIcon, TrashIcon } from "@heroicons/react/24/outline"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { type FormEvent, useState } from "react"
import type { Bot } from "../../../shared/bots"
import { type Frequency, type Routine, type Weekday, weekdays } from "../../../shared/routines"
import type { EngineClient } from "../engine-client"
import { Button } from "../ui/button"
import { fieldControlClassName } from "../ui/field"
import { IconButton } from "../ui/icon-button"
import { Select } from "../ui/select"
import { revealClassName } from "./bot-form"
import { describeFrequency, weekdayLabels } from "./routine-frequency"

type Draft = { content: string; form: Frequency["form"]; everyMinutes: string; days: Weekday[]; time: string; at: string }

const emptyDraft: Draft = { content: "", form: "interval", everyMinutes: "30", days: ["monday"], time: "09:00", at: "" }

function localDateTime(iso: string) {
  const at = new Date(iso)
  const pad = (value: number) => String(value).padStart(2, "0")

  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`
}

function draftOf(routine: Routine): Draft {
  if (routine.frequency.form === "interval") {
    return { ...emptyDraft, content: routine.content, everyMinutes: String(routine.frequency.everyMinutes) }
  }

  if (routine.frequency.form === "once") {
    return { ...emptyDraft, content: routine.content, form: "once", at: localDateTime(routine.frequency.at) }
  }

  return { ...emptyDraft, content: routine.content, form: "fixed-time", days: routine.frequency.days, time: routine.frequency.time }
}

function frequencyOf(draft: Draft): Frequency | undefined {
  if (draft.form === "interval") {
    const everyMinutes = Number(draft.everyMinutes)

    return Number.isInteger(everyMinutes) && everyMinutes >= 1 ? { form: "interval", everyMinutes } : undefined
  }

  if (draft.form === "once") {
    const at = new Date(draft.at)

    return at > new Date() ? { form: "once", at: at.toISOString() } : undefined
  }

  return draft.days.length > 0 && draft.time ? { form: "fixed-time", days: draft.days, time: draft.time } : undefined
}

const forms: Record<string, Frequency["form"]> = { interval: "interval", "fixed-time": "fixed-time", once: "once" }

export function BotRoutines({ bot, client }: { bot: Bot; client: EngineClient }) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<string | null>(null)
  const listOptions = client.query.routines.list.queryOptions({ input: { botId: bot.id } })
  const { data: routines, error: listError } = useQuery(listOptions)
  const settled = { onSuccess() {
    queryClient.invalidateQueries({ queryKey: listOptions.queryKey })
    setEditing(null)
  } }
  const { mutate: create, isPending: creating, error: createError } = useMutation(client.query.routines.create.mutationOptions(settled))
  const { mutate: update, isPending: updating, error: updateError } = useMutation(client.query.routines.update.mutationOptions(settled))
  const { mutate: remove, isPending: removing, error: removeError } = useMutation(client.query.routines.remove.mutationOptions(settled))
  const failure = listError?.message ?? createError?.message ?? updateError?.message ?? removeError?.message
  const busy = creating || updating || removing

  return (
    <section className="mt-10 flex w-[min(360px,100%)] flex-col gap-3 text-left" aria-label="Rotinas">
      <h3 className="m-0 text-label uppercase text-muted">Rotinas</h3>
      {routines?.length === 0 && editing !== "new" && <p className="m-0 text-support text-muted">Nenhuma Rotina. {bot.name} só trabalha quando você chama.</p>}
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {routines?.map((routine) => (
          <li key={routine.id}>
            {editing === routine.id
              ? <RoutineForm initial={draftOf(routine)} pending={updating} submitLabel="Salvar Rotina" onCancel={() => setEditing(null)} onSubmit={(content, frequency) => update({ id: routine.id, content, frequency, enabled: routine.enabled })} />
              : (
                <div className={`${revealClassName} flex items-center gap-2 rounded-lg border border-outline px-3 py-2`}>
                  <div className="min-w-0 flex-1">
                    <p className={`m-0 truncate text-control ${routine.enabled ? "text-primary" : "text-muted"}`} title={routine.content}>{routine.content}</p>
                    <p className="m-0 text-support text-muted">{describeFrequency(routine.frequency)}{routine.enabled ? "" : " · pausada"}</p>
                  </div>
                  <IconButton iconSize={14} size={28} type="button" disabled={busy} label={routine.enabled ? "Pausar Rotina" : "Retomar Rotina"} onClick={() => update({ id: routine.id, content: routine.content, frequency: routine.frequency, enabled: !routine.enabled })}>{routine.enabled ? <PauseIcon aria-hidden="true" /> : <PlayIcon aria-hidden="true" />}</IconButton>
                  <IconButton iconSize={14} size={28} type="button" disabled={busy} label="Editar Rotina" onClick={() => setEditing(routine.id)}><PencilIcon aria-hidden="true" /></IconButton>
                  <IconButton iconSize={14} size={28} type="button" disabled={busy} label="Remover Rotina" onClick={() => remove({ id: routine.id })}><TrashIcon aria-hidden="true" /></IconButton>
                </div>
              )}
          </li>
        ))}
      </ul>
      {editing === "new"
        ? <RoutineForm initial={emptyDraft} pending={creating} submitLabel="Adicionar Rotina" onCancel={() => setEditing(null)} onSubmit={(content, frequency) => create({ botId: bot.id, content, frequency })} />
        : <Button className="self-start" variant="text" type="button" disabled={busy} onClick={() => setEditing("new")}>Nova Rotina</Button>}
      {failure && <p className="m-0 text-support text-status-error">Falha nas Rotinas: {failure}</p>}
    </section>
  )
}

function RoutineForm({ initial, pending, submitLabel, onCancel, onSubmit }: { initial: Draft; pending: boolean; submitLabel: string; onCancel: () => void; onSubmit: (content: string, frequency: Frequency) => void }) {
  const [draft, setDraft] = useState(initial)
  const content = draft.content.trim()
  const frequency = frequencyOf(draft)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!content || !frequency) {
      return
    }

    onSubmit(content, frequency)
  }

  function toggleDay(day: Weekday) {
    const days = draft.days.includes(day) ? draft.days.filter((chosen) => chosen !== day) : weekdays.filter((chosen) => chosen === day || draft.days.includes(chosen))
    setDraft({ ...draft, days })
  }

  return (
    <form className={`${revealClassName} flex flex-col gap-2 rounded-lg border border-outline-strong p-3`} onSubmit={handleSubmit}>
      <label className="sr-only" htmlFor="routine-content">Pedido da Rotina</label>
      <textarea className={`${fieldControlClassName} field-sizing-content max-h-32 resize-none font-normal`} id="routine-content" autoFocus placeholder="Verifique a caixa de entrada e me avise do que precisa de resposta" rows={2} value={draft.content} onChange={(event) => setDraft({ ...draft, content: event.target.value })} />
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <label>
          <span className="sr-only">Forma da Frequência</span>
          <Select value={draft.form} onChange={(event) => setDraft({ ...draft, form: forms[event.target.value] ?? "interval" })}>
            <option value="interval">A cada</option>
            <option value="fixed-time">Nos dias</option>
            <option value="once">Uma vez</option>
          </Select>
        </label>
        {draft.form === "interval" && <label className="flex items-center gap-2 text-control text-secondary"><span className="sr-only">Minutos</span><input className={`${fieldControlClassName} w-20`} type="number" min={1} step={1} value={draft.everyMinutes} onChange={(event) => setDraft({ ...draft, everyMinutes: event.target.value })} />minutos</label>}
        {draft.form === "fixed-time" && <label className="flex items-center gap-2 text-control text-secondary">às<span className="sr-only">Hora</span><input className={`${fieldControlClassName} w-28`} type="time" value={draft.time} onChange={(event) => setDraft({ ...draft, time: event.target.value })} /></label>}
        {draft.form === "once" && <label className="flex items-center gap-2 text-control text-secondary">em<span className="sr-only">Data e hora</span><input className={`${fieldControlClassName} w-44`} type="datetime-local" value={draft.at} onChange={(event) => setDraft({ ...draft, at: event.target.value })} /></label>}
      </div>
      {draft.form === "fixed-time" && (
        <div className="flex gap-1" role="group" aria-label="Dias da semana">
          {weekdays.map((day) => <button key={day} className={`flex-1 rounded-md border px-0 py-1.5 text-metadata font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${draft.days.includes(day) ? "border-focus bg-surface-active text-primary" : "border-outline bg-transparent text-muted hover:bg-surface-hover hover:text-secondary"}`} type="button" aria-pressed={draft.days.includes(day)} onClick={() => toggleDay(day)}>{weekdayLabels[day]}</button>)}
        </div>
      )}
      <div className="mt-1 flex justify-end gap-2">
        <Button variant="text" type="button" disabled={pending} onClick={onCancel}>Cancelar</Button>
        <Button type="submit" disabled={pending || !content || !frequency}>{pending ? "Salvando..." : submitLabel}</Button>
      </div>
    </form>
  )
}
