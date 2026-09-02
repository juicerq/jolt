import { expect, test } from "bun:test"
import { createEngineClient } from "@src/renderer/src/engine-client"

test("keeps query helpers and streaming calls on separate client branches", () => {
  const client = createEngineClient({ url: "http://127.0.0.1:1", token: "test-token" })

  expect(typeof client.query.conversations.history.queryOptions).toBe("function")
  expect(typeof client.raw.conversations.send).toBe("function")
})

test("does not report a cancelled request as a failed RPC", async () => {
  const paths: string[] = []
  const server = Bun.serve({
    port: 0,
    fetch(request) {
      paths.push(new URL(request.url).pathname)

      if (request.url.endsWith("/observations/rendererSpan")) {
        return new Response(JSON.stringify({ json: {} }), { headers: { "content-type": "application/json" } })
      }

      return new Promise((resolve) => {
        request.signal.addEventListener("abort", () => resolve(new Response(null, { status: 499 })))
      })
    },
  })

  try {
    const client = createEngineClient({ url: `http://127.0.0.1:${server.port}`, token: "test-token" })
    const controller = new AbortController()
    const call = client.raw.projects.list(undefined, { signal: controller.signal })

    await new Promise((resolve) => setTimeout(resolve, 20))
    controller.abort()

    await expect(call).rejects.toThrow()
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(paths).toEqual(["/projects/list"])
  } finally {
    server.stop(true)
  }
})

test("bundles the Renderer's shared imports without schemas", async () => {
  const build = await Bun.build({
    entrypoints: [
      "src/renderer/src/engine-client.ts",
      "src/shared/bot-efforts.ts",
      "src/shared/memory-limits.ts",
      "src/shared/message-images.ts",
      "src/shared/weekdays.ts",
    ],
    target: "browser",
  })
  const sources = await Promise.all(build.outputs.map((output) => output.text()))

  expect(build.success).toBe(true)
  expect(sources.some((source) => source.includes("unrecognized_keys"))).toBe(false)
})
