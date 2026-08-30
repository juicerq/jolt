import { describe, expect, test } from "bun:test"
import { observation } from "./observation"

describe("Observation envelope", () => {
  test("rejects undeclared fields", () => {
    expect(() => observation.assert({
      kind: "event",
      name: "engine.started",
      timestamp: new Date().toISOString(),
      level: "info",
      content: "private message",
    })).toThrow()
  })
})
