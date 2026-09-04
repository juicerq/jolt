import type { Frequency, Routine, Weekday } from "../../../shared/routines"

export interface RoutineDraft { name: string; content: string; form: Frequency["form"]; everyMinutes: string; days: Weekday[]; times: string; startTime: string; endTime: string; at: string }

export const emptyRoutineDraft: RoutineDraft = { name: "", content: "", form: "interval", everyMinutes: "60", days: ["monday", "tuesday", "wednesday", "thursday", "friday"], times: "09:00", startTime: "08:00", endTime: "17:00", at: "" }

export const frequencyForms: Record<string, Frequency["form"]> = { interval: "interval", "fixed-time": "fixed-time", once: "once" }

type FrequencyField = "minutes" | "days" | "window" | "times" | "at"
type FrequencyResult = { frequency: Frequency; error?: never; field?: never } | { frequency?: never; error: string; field: FrequencyField }

function localDateTime(iso: string) {
  const at = new Date(iso)
  const pad = (value: number) => String(value).padStart(2, "0")

  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`
}

export function routineDraftOf(routine: Routine): RoutineDraft {
  if (routine.frequency.form === "interval") {
    return { ...emptyRoutineDraft, name: routine.name, content: routine.content, everyMinutes: String(routine.frequency.everyMinutes), days: routine.frequency.days, startTime: routine.frequency.startTime, endTime: routine.frequency.endTime }
  }

  if (routine.frequency.form === "once") {
    return { ...emptyRoutineDraft, name: routine.name, content: routine.content, form: "once", at: localDateTime(routine.frequency.at) }
  }

  return { ...emptyRoutineDraft, name: routine.name, content: routine.content, form: "fixed-time", days: routine.frequency.days, times: routine.frequency.times.join(", ") }
}

export function frequencyResultOf(draft: RoutineDraft): FrequencyResult {
  if (draft.form === "interval") {
    const everyMinutes = Number(draft.everyMinutes)

    if (!Number.isInteger(everyMinutes) || everyMinutes < 1) {
      return { error: "Use um intervalo de pelo menos 1 minuto.", field: "minutes" }
    }

    if (draft.days.length === 0) {
      return { error: "Escolha ao menos um dia.", field: "days" }
    }

    if (!draft.startTime || !draft.endTime) {
      return { error: "Informe os horários inicial e final.", field: "window" }
    }

    if (draft.startTime >= draft.endTime) {
      return { error: "O horário final deve ser depois do inicial.", field: "window" }
    }

    return { frequency: { form: "interval", everyMinutes, days: draft.days, startTime: draft.startTime, endTime: draft.endTime } }
  }

  if (draft.form === "once") {
    const at = new Date(draft.at)

    if (!draft.at || Number.isNaN(at.getTime())) {
      return { error: "Escolha uma data e hora.", field: "at" }
    }

    if (at <= new Date()) {
      return { error: "Escolha uma data futura.", field: "at" }
    }

    return { frequency: { form: "once", at: at.toISOString() } }
  }

  if (draft.days.length === 0) {
    return { error: "Escolha ao menos um dia.", field: "days" }
  }

  const entries = draft.times.split(",").map((time) => time.trim()).filter(Boolean)

  if (entries.length === 0) {
    return { error: "Informe ao menos um horário.", field: "times" }
  }

  if (entries.some((time) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) {
    return { error: "Use horários como 09:00, separados por vírgulas.", field: "times" }
  }

  return { frequency: { form: "fixed-time", days: draft.days, times: [...new Set(entries)].sort() } }
}

export function frequencyOf(draft: RoutineDraft): Frequency | undefined {
  return frequencyResultOf(draft).frequency
}
