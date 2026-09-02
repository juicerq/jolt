import { describe, expect, test } from "bun:test"
import { observation } from "@src/shared/observability/observation"

describe("Observation envelope", () => {
  test("rejects undeclared fields", () => {
    expect(() => observation.parse({
      kind: "event",
      name: "engine.started",
      timestamp: new Date().toISOString(),
      level: "info",
      content: "private message",
    })).toThrow()
  })
})
