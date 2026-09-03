import type { Frequency, Routine, Weekday } from "../../../shared/routines"

export type RoutineDraft = { name: string; content: string; form: Frequency["form"]; everyMinutes: string; days: Weekday[]; times: string; startTime: string; endTime: string; at: string }

export const emptyRoutineDraft: RoutineDraft = { name: "", content: "", form: "interval", everyMinutes: "60", days: ["monday", "tuesday", "wednesday", "thursday", "friday"], times: "09:00", startTime: "08:00", endTime: "17:00", at: "" }

export const frequencyForms: Record<string, Frequency["form"]> = { interval: "interval", "fixed-time": "fixed-time", once: "once" }

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

export function frequencyOf(draft: RoutineDraft): Frequency | undefined {
  if (draft.form === "interval") {
    const everyMinutes = Number(draft.everyMinutes)

    return Number.isInteger(everyMinutes) && everyMinutes >= 1 && draft.days.length > 0 && draft.startTime <= draft.endTime ? { form: "interval", everyMinutes, days: draft.days, startTime: draft.startTime, endTime: draft.endTime } : undefined
  }

  if (draft.form === "once") {
    const at = new Date(draft.at)

    return at > new Date() ? { form: "once", at: at.toISOString() } : undefined
  }

  const times = [...new Set(draft.times.split(",").map((time) => time.trim()).filter((time) => /^([01]\d|2[0-3]):[0-5]\d$/.test(time)))].sort()

  return draft.days.length > 0 && times.length > 0 ? { form: "fixed-time", days: draft.days, times } : undefined
}
