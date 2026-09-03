import { describe, expect, test } from "bun:test"
import type { Frequency } from "@src/shared/routines"
import { describeFrequency } from "@src/renderer/src/bots/routine-frequency"

describe("describeFrequency", () => {
  test.each<[Frequency, string]>([
    [{ form: "interval", everyMinutes: 60, days: ["monday", "tuesday", "wednesday", "thursday", "friday"], startTime: "08:00", endTime: "17:00" }, "Seg, Ter, Qua, Qui, Sex · de hora em hora · 08:00–17:00"],
    [{ form: "interval", everyMinutes: 1, days: ["monday"], startTime: "08:00", endTime: "09:00" }, "Seg · a cada minuto · 08:00–09:00"],
    [{ form: "fixed-time", days: ["monday", "friday"], times: ["09:00", "14:00"] }, "Seg, Sex · 09:00, 14:00"],
    [{ form: "once", at: new Date(2026, 8, 1, 14, 30).toISOString() }, "Uma vez, 01/09 às 14:30"],
  ])("phrases the Frequência for the person", (frequency, phrase) => {
    expect(describeFrequency(frequency)).toBe(phrase)
  })
})
