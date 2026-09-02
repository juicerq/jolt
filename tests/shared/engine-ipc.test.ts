import { describe, expect, test } from "bun:test"
import { engineConnection, engineReadyMessage } from "@src/shared/engine-ipc"
import { parse } from "@src/shared/parse"

describe("engine readiness boundary", () => {
  test("rejects a readiness message without a usable port", () => {
    expect(() => parse(engineReadyMessage, { type: "ready", port: 0 })).toThrow()
  })
})

describe("engine connection boundary", () => {
  test("accepts only loopback HTTP connections with a token", () => {
    expect(parse(engineConnection, { url: "http://127.0.0.1:3210/rpc", token: "secret" })).toEqual({
      url: "http://127.0.0.1:3210/rpc",
      token: "secret",
    })
    expect(() => parse(engineConnection, { url: "https://example.com/rpc", token: "secret" })).toThrow()
    expect(() => parse(engineConnection, { url: "http://localhost:3210/rpc", token: "" })).toThrow()
  })
})
