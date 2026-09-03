import type { Frequency, Weekday } from "../../../shared/routines"

export const weekdayLabels: Record<Weekday, string> = {
  monday: "Seg",
  tuesday: "Ter",
  wednesday: "Qua",
  thursday: "Qui",
  friday: "Sex",
  saturday: "Sáb",
  sunday: "Dom",
}

export function describeFrequency(frequency: Frequency) {
  if (frequency.form === "interval") {
    const cadence = frequency.everyMinutes === 60 ? "de hora em hora" : frequency.everyMinutes === 1 ? "a cada minuto" : `a cada ${frequency.everyMinutes} minutos`

    return `${frequency.days.map((day) => weekdayLabels[day]).join(", ")} · ${cadence} · ${frequency.startTime}–${frequency.endTime}`
  }

  if (frequency.form === "once") {
    const at = Date.parse(frequency.at)
    const date = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(at)
    const time = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(at)

    return `Uma vez, ${date} às ${time}`
  }

  return `${frequency.days.map((day) => weekdayLabels[day]).join(", ")} · ${frequency.times.join(", ")}`
}
