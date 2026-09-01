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
    return frequency.everyMinutes === 1 ? "A cada minuto" : `A cada ${frequency.everyMinutes} minutos`
  }

  if (frequency.form === "once") {
    const at = Date.parse(frequency.at)
    const date = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(at)
    const time = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(at)

    return `Uma vez, ${date} às ${time}`
  }

  return `${frequency.days.map((day) => weekdayLabels[day]).join(", ")} às ${frequency.time}`
}
