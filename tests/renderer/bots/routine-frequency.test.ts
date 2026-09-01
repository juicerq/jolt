import { describe, expect, test } from "bun:test"
import type { Frequency } from "@src/shared/routines"
import { describeFrequency } from "@src/renderer/src/bots/routine-frequency"

describe("describeFrequency", () => {
  test.each<[Frequency, string]>([
    [{ form: "interval", everyMinutes: 30 }, "A cada 30 minutos"],
    [{ form: "interval", everyMinutes: 1 }, "A cada minuto"],
    [{ form: "fixed-time", days: ["monday", "friday"], time: "09:00" }, "Seg, Sex às 09:00"],
    [{ form: "once", at: new Date(2026, 8, 1, 14, 30).toISOString() }, "Uma vez, 01/09 às 14:30"],
  ])("phrases the Frequência for the person", (frequency, phrase) => {
    expect(describeFrequency(frequency)).toBe(phrase)
  })
})
