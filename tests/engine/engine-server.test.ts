import { afterEach, expect, test } from "bun:test"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { createEngineServer } from "@src/engine/app/engine-server"
import { must } from "../support/expect"
import { testDirectory } from "../support/test-directory"

const directory = testDirectory("mimo-engine-server-")
const token = "token-antigo"
const origin = "https://notebook.tail0000.ts.net"
const servers: ReturnType<typeof createEngineServer>[] = []

afterEach(async () => {
  for (const server of servers.splice(0)) {
    await server.stop(true)
  }
})

function handler() {
  const streams: AbortSignal[] = []

  return {
    streams,
    async handle(request: Request) {
      const { pathname } = new URL(request.url)

      if (pathname === "/rpc/ping") {
        return { matched: true as const, response: new Response("pong") }
      }

      if (pathname === "/rpc/stream") {
        streams.push(request.signal)
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue("aberto\n")
            request.signal.addEventListener("abort", () => controller.close(), { once: true })
          },
        })

        return { matched: true as const, response: new Response(stream, { headers: { "content-type": "text/event-stream" } }) }
      }

      return { matched: false as const, response: undefined }
    },
  }
}

function serve(options: { port?: number; rendererDirectory?: string; origin?: string } = {}) {
  const rpc = handler()
  const server = createEngineServer({ port: options.port ?? 0, access: { token, ...(options.origin ? { origin: options.origin } : {}) }, ...(options.rendererDirectory ? { rendererDirectory: options.rendererDirectory } : {}), handler: rpc })
  servers.push(server)

  return { ...rpc, server, url: (path: string) => `http://127.0.0.1:${server.port}${path}` }
}

function bearer(value: string) {
  return { authorization: `Bearer ${value}` }
}

test("RPC exige o Bearer atual e a rotação encerra os streams do token antigo sem parar o servidor", async () => {
  const { server, streams, url } = serve()
  expect((await fetch(url("/rpc/ping"))).status).toBe(401)
  expect((await fetch(url("/rpc/ping"), { headers: bearer("errado") })).status).toBe(401)
  expect(await (await fetch(url("/rpc/ping"), { headers: bearer(token) })).text()).toBe("pong")
  const stream = await fetch(url("/rpc/stream"), { headers: bearer(token) })
  const reader = must(stream.body).getReader()
  expect(new TextDecoder().decode((await reader.read()).value)).toBe("aberto\n")

  server.grant({ token: "token-novo" })

  expect(must(streams[0]).aborted).toBe(true)
  expect((await reader.read()).done).toBe(true)
  expect((await fetch(url("/rpc/ping"), { headers: bearer(token) })).status).toBe(401)
  expect(await (await fetch(url("/rpc/ping"), { headers: bearer("token-novo") })).text()).toBe("pong")
})

test("só a origem HTTPS concedida e as origens locais passam, mesmo com Host manipulado", async () => {
  const { server, url } = serve({ origin })
  const spoofed = { ...bearer(token), origin: "https://outro.example", host: new URL(origin).host, "x-forwarded-host": new URL(origin).host }
  expect((await fetch(url("/rpc/ping"), { headers: spoofed })).status).toBe(403)
  expect((await fetch(url("/rpc/ping"), { method: "OPTIONS", headers: { origin: "https://outro.example" } })).status).toBe(403)
  expect((await fetch(url("/rpc/ping"), { headers: { ...bearer(token), origin: "http://outro.example" } })).status).toBe(403)

  const granted = await fetch(url("/rpc/ping"), { headers: { ...bearer(token), origin } })
  expect(granted.status).toBe(200)
  expect(granted.headers.get("access-control-allow-origin")).toBe(origin)
  expect((await fetch(url("/rpc/ping"), { headers: { ...bearer(token), origin: "http://localhost:5173" } })).status).toBe(200)
  expect((await fetch(url("/rpc/ping"), { headers: { ...bearer(token), origin: "null" } })).status).toBe(200)

  server.grant({ token, origin: "https://novo.tail0000.ts.net" })

  expect((await fetch(url("/rpc/ping"), { headers: { ...bearer(token), origin } })).status).toBe(403)
  expect((await fetch(url("/rpc/ping"), { headers: { ...bearer(token), origin: "https://novo.tail0000.ts.net" } })).status).toBe(200)
})

test("os arquivos do Renderer saem sem Bearer e nenhum caminho escapa da pasta pública", async () => {
  const rendererDirectory = join(directory, "renderer")
  mkdirSync(join(rendererDirectory, "assets"), { recursive: true })
  writeFileSync(join(rendererDirectory, "index.html"), "<html>mimo</html>")
  writeFileSync(join(rendererDirectory, "assets", "app.js"), "console.log(1)")
  writeFileSync(join(directory, "secret.txt"), "segredo")
  const { url } = serve({ rendererDirectory })

  expect(await (await fetch(url("/"))).text()).toBe("<html>mimo</html>")
  expect(await (await fetch(url("/assets/app.js"))).text()).toBe("console.log(1)")
  expect((await fetch(url("/assets/"))).status).toBe(404)
  expect((await fetch(url("/nao-existe.js"))).status).toBe(404)
  expect((await fetch(url("/..%2Fsecret.txt"))).status).toBe(404)
  expect((await fetch(url("/assets/..%2F..%2Fsecret.txt"))).status).toBe(404)
  expect((await fetch(url("/index.html"), { method: "POST" })).status).toBe(404)
  expect((await fetch(url("/rpc/ping"))).status).toBe(401)

  const { url: bare } = serve()
  expect((await fetch(bare("/"))).status).toBe(404)
})

test("porta fixa ocupada não impede o Engine: ele sobe em outra porta", async () => {
  const first = serve()
  const second = serve({ port: first.server.port })

  expect(second.server.port).toBeGreaterThan(0)
  expect(second.server.port).not.toBe(first.server.port)
  expect(await (await fetch(second.url("/rpc/ping"), { headers: bearer(token) })).text()).toBe("pong")
})
