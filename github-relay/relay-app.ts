import { Elysia, t } from "elysia"
import type { GithubApp } from "./github-app"
import type { RelayDatabase } from "./relay-database"

function bearer(request: Request) {
  const authorization = request.headers.get("authorization")

  if (!authorization?.startsWith("Bearer ")) {
    throw new Error("Unauthorized")
  }

  return authorization.slice("Bearer ".length)
}

function html(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;")
}

function connectedPage(accountLogin: string) {
  return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>GitHub conectado ao Jolt</title><body style="font:16px system-ui;background:#0c0a09;color:#f5f3f1;display:grid;place-items:center;min-height:100vh;margin:0"><main style="max-width:32rem;padding:2rem"><h1 style="font-size:1.25rem">GitHub conectado ao Jolt</h1><p style="color:#b3adaa;line-height:1.6">A Conta ${html(accountLogin)} foi conectada. Você pode fechar esta página e voltar ao Jolt.</p></main></body></html>`
}

export function createRelayApp(input: { database: RelayDatabase; github: GithubApp }) {
  return new Elysia()
    .onAfterHandle(({ set }) => {
      set.headers["cache-control"] = "no-store"
    })
    .onError(({ code, error, set }) => {
      const unauthorized = error instanceof Error && error.message === "Unauthorized"
      const validation = code === "VALIDATION"
      set.headers["cache-control"] = "no-store"

      if (unauthorized) {
        set.status = 401
        return "Unauthorized"
      }

      if (validation) {
        set.status = 400
        return "Invalid request"
      }

      if (code === "NOT_FOUND") {
        set.status = 404
        return "Not found"
      }

      set.status = 500
      console.error(error)
      return "Request failed"
    })
    .get("/health", () => ({ status: "ready" }))
    .post("/v1/connections", ({ set }) => {
      const connection = input.database.createConnection()
      set.status = 201

      return { connectionId: connection.id, connectionToken: connection.token, installUrl: input.github.installUrl(connection.state) }
    })
    .get("/v1/connections/:connectionId", ({ params, request }) => input.database.connection(params.connectionId, bearer(request)), {
      params: t.Object({ connectionId: t.String({ minLength: 1 }) }),
    })
    .get("/github/setup", async ({ query, set }) => {
      const installation = await input.github.installation(query.installation_id)
      input.database.complete(query.state, installation.id, installation.accountLogin)
      set.headers["content-type"] = "text/html; charset=utf-8"

      return connectedPage(installation.accountLogin)
    }, {
      query: t.Object({ state: t.String({ minLength: 1 }), installation_id: t.String({ minLength: 1 }) }),
    })
    .post("/github/webhook", async ({ request, set }) => {
      const body = await request.text()

      if (!input.github.verify(body, request.headers.get("x-hub-signature-256"))) {
        throw new Error("Unauthorized")
      }

      const deliveryId = request.headers.get("x-github-delivery")

      if (!deliveryId) {
        set.status = 400
        return "Missing delivery id"
      }

      const event = input.github.event(deliveryId, request.headers.get("x-github-event"), body)

      if (event) {
        input.database.save(event)
        input.database.clean()
      }

      set.status = 202
    })
    .post("/v1/installations/:installationId/token", async ({ params, request }) => {
      input.database.authorize(params.installationId, bearer(request))

      return input.github.token(params.installationId)
    }, {
      params: t.Object({ installationId: t.String({ minLength: 1 }) }),
    })
    .get("/v1/installations/:installationId/events", ({ params, query, request }) => {
      const cursor = Number(query.cursor ?? "0")

      return input.database.events(params.installationId, bearer(request), cursor)
    }, {
      params: t.Object({ installationId: t.String({ minLength: 1 }) }),
      query: t.Object({ cursor: t.Optional(t.String({ pattern: "^(0|[1-9][0-9]*)$", maxLength: 15 })) }),
    })
}
