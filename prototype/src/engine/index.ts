import { RPCHandler } from "@orpc/server/fetch"
import { implement } from "@orpc/server"
import { contract } from "../shared/contract"
import { openPrototypeDatabase } from "./database"
import { runClaudeProbe } from "./claude-probe"
import { runCodexProbe } from "./codex-probe"

const token = process.env.PROTOTYPE_TOKEN
const databasePath = process.env.PROTOTYPE_DATABASE_PATH

if (!token || !databasePath) {
  throw new Error("PROTOTYPE_TOKEN and PROTOTYPE_DATABASE_PATH are required")
}

const database = openPrototypeDatabase(databasePath)
const startedAt = new Date().toISOString()
const os = implement(contract)
const router = os.router({
  health: os.health.handler(() => ({
    runtime: `Bun ${Bun.version}`,
    pid: process.pid,
    startedAt,
    databasePath,
  })),
  counter: {
    read: os.counter.read.handler(() => database.read()),
    increment: os.counter.increment.handler(() => database.increment()),
  },
  events: os.events.handler(async function* () {
    for (const [index, message] of ["engine stream opened", "event crossed oRPC", "stream completed"].entries()) {
      yield { sequence: index + 1, message, emittedAt: new Date().toISOString() }
      await Bun.sleep(250)
    }
  }),
  probes: {
    codex: os.probes.codex.handler(() => runCodexProbe()),
    claude: os.probes.claude.handler(() => runClaudeProbe()),
  },
})
const handler = new RPCHandler(router)
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "access-control-allow-headers": "authorization, content-type",
          "access-control-allow-methods": "GET, POST, OPTIONS",
          "access-control-allow-origin": "*",
        },
      })
    }

    if (request.headers.get("authorization") !== `Bearer ${token}`) {
      return new Response("Unauthorized", { status: 401 })
    }

    const { matched, response } = await handler.handle(request, {
      prefix: "/rpc",
      context: {},
    })

    if (!matched) {
      return new Response("Not found", { status: 404 })
    }

    response.headers.set("access-control-allow-origin", "*")

    return response
  },
})

process.send?.({ type: "ready", port: server.port })
process.stdout.write(`${JSON.stringify({ type: "ready", port: server.port })}\n`)

process.on("SIGTERM", () => {
  database.close()
  server.stop(true)
  process.exit(0)
})
