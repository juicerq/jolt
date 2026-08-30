import { createORPCClient } from "@orpc/client"
import { RPCLink } from "@orpc/client/fetch"
import { oc } from "@orpc/contract"
import { implement } from "@orpc/server"
import { RPCHandler } from "@orpc/server/fetch"
import { afterEach, describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, rmSync } from "node:fs"
import { join } from "node:path"
import { openDatabase } from "../persistence/database"
import { createObservationSystem } from "./observability"
import { runObservedSubprocess } from "./observed-subprocess"

const testDirectory = join(import.meta.dir, ".propagation-test")

afterEach(() => {
  if (existsSync(testDirectory)) {
    rmSync(testDirectory, { recursive: true })
  }
})

describe("observation context", () => {
  test("keeps one Renderer trace through HTTP, oRPC, Drizzle and a subprocess", async () => {
    const system = createObservationSystem({ appSessionId: "session-1", logDirectory: testDirectory, development: false })
    mkdirSync(testDirectory, { recursive: true })
    const database = openDatabase(join(testDirectory, "test.sqlite"), system.observability)
    const contract = { run: oc.route({ method: "GET", path: "/run" }) }
    const operations = implement(contract).$context<{ traceId: string }>()
    const router = operations.router({
      run: operations.run.handler(({ context }: { context: { traceId: string } }) =>
        system.observability.span({ name: "orpc.fixture", context: { traceId: context.traceId } }, async () => {
          database.migrationState()
          const result = await runObservedSubprocess([process.execPath, "-e", "process.stdout.write('ok')"], system.observability)

          return result.stdout
        }),
      ),
    })
    const handler = new RPCHandler(router)
    const server = Bun.serve({
      port: 0,
      async fetch(request) {
        const result = await handler.handle(request, { context: { traceId: request.headers.get("x-trace-id") ?? "" } })

        return result.matched ? result.response : new Response("Not found", { status: 404 })
      },
    })
    const client = createORPCClient(new RPCLink({
      url: `http://127.0.0.1:${server.port}`,
      headers: { "x-trace-id": "renderer-trace" },
    })) as { run(): Promise<string> }

    expect(await client.run()).toBe("ok")
    await server.stop()
    await system.observability.flush()
    database.close()

    const relevant = system.diagnostics.recent().filter((item) =>
      ["orpc.fixture", "database.transaction", "subprocess.execute"].includes(item.name),
    )
    const root = relevant.find((item) => item.name === "orpc.fixture")
    const children = relevant.filter((item) => item.name !== "orpc.fixture")

    expect(relevant).toHaveLength(3)
    expect(relevant.every((item) => item.traceId === "renderer-trace")).toBe(true)
    expect(children.every((item) => item.parentSpanId === root?.spanId)).toBe(true)
  })
})
