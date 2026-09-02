import { describe, expect, test } from "bun:test"
import { createSecrets } from "@src/engine/plugins/secrets"

describe("secrets", () => {
  test("a sealed secret opens only with the same key", () => {
    const secrets = createSecrets("ab".repeat(32))
    const sealed = secrets.seal("refresh-token")

    expect(sealed).not.toContain("refresh-token")
    expect(secrets.open(sealed)).toBe("refresh-token")
    expect(() => createSecrets("cd".repeat(32)).open(sealed)).toThrow()
    expect(() => createSecrets("ab")).toThrow()
  })
})
