import { describe, expect, test } from "bun:test"
import { providerAvailability } from "@src/shared/providers"

describe("provider availability boundary", () => {
  test("rejects session data outside provider and status", () => {
    expect(() => providerAvailability.assert({
      provider: "codex",
      status: "available",
      version: "0.151.0",
      email: "user@example.com",
    })).toThrow()
  })
})
