import { describe, expect, test } from "bun:test"
import { routineSchemas } from "@src/shared/routines"

const validCreate = { botId: "bot-1", content: "check inbox", frequency: { form: "interval", everyMinutes: 5 } }

describe("Routine schemas", () => {
  test("createInput accepts an interval routine", () => {
    expect(routineSchemas.createInput.safeParse(validCreate).success).toBe(true)
  })

  test("createInput rejects an extra key", () => {
    expect(() => routineSchemas.createInput.parse({ ...validCreate, extra: true })).toThrow()
  })

  test("createInput rejects everyMinutes below 1", () => {
    expect(routineSchemas.createInput.safeParse({ ...validCreate, frequency: { form: "interval", everyMinutes: 0 } }).success).toBe(false)
  })

  test.each([
    ["empty days", { form: "fixed-time", days: [], time: "09:00" }],
    ["invalid time", { form: "fixed-time", days: ["monday"], time: "24:00" }],
  ])("createInput rejects a fixed-time frequency with %s", (_label, frequency) => {
    expect(routineSchemas.createInput.safeParse({ ...validCreate, frequency }).success).toBe(false)
  })

  test("updateInput rejects an extra key", () => {
    const input = { id: "routine-1", content: "check inbox", frequency: validCreate.frequency, enabled: true, extra: true }

    expect(() => routineSchemas.updateInput.parse(input)).toThrow()
  })
})
