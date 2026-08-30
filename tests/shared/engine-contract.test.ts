import { describe, expect, test } from "bun:test"
import { engineConnection, engineReadyMessage } from "@src/shared/engine-contract"

describe("engine readiness boundary", () => {
  test("rejects a readiness message without a usable port", () => {
    expect(() => engineReadyMessage.assert({ type: "ready", port: 0 })).toThrow()
  })
})

describe("engine connection boundary", () => {
  test("accepts only loopback HTTP connections with a token", () => {
    expect(engineConnection.assert({ url: "http://127.0.0.1:3210/rpc", token: "secret" })).toEqual({
      url: "http://127.0.0.1:3210/rpc",
      token: "secret",
    })
    expect(() => engineConnection.assert({ url: "https://example.com/rpc", token: "secret" })).toThrow()
    expect(() => engineConnection.assert({ url: "http://localhost:3210/rpc", token: "" })).toThrow()
  })
})
