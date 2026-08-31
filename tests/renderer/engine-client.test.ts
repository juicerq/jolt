import { expect, test } from "bun:test"
import { createEngineClient } from "@src/renderer/src/engine-client"

test("keeps query helpers and streaming calls on separate client branches", () => {
  const client = createEngineClient({ url: "http://127.0.0.1:1", token: "test-token" })

  expect(typeof client.query.conversations.history.queryOptions).toBe("function")
  expect(typeof client.raw.conversations.send).toBe("function")
})
