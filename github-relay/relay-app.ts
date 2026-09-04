import { Elysia, t } from "elysia"
import type { GithubApp } from "./github-app"
import type { RelayDatabase } from "./relay-database"

const connectionWindowMs = 60_000
const connectionsPerWindow = 10
const maximumConnectionSources = 1_000

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

function page(title: string, content: string) {
  return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${html(title)}</title><style>
  :root{color-scheme:dark;font:16px system-ui;background:#0c0a09;color:#f5f3f1}
  *{box-sizing:border-box}body{display:grid;place-items:center;min-height:100vh;margin:0}
  main{width:100%;max-width:36rem;padding:2rem}h1{font-size:1.25rem}p{color:#b3adaa;line-height:1.6}
  form{display:grid;gap:.75rem;margin:1rem 0}button{font:inherit;border-radius:.5rem;padding:.75rem}
  button{border:0;background:#f5f3f1;color:#0c0a09;cursor:pointer}button:hover{background:#b3adaa}button:active{opacity:.8}
  a{color:inherit;text-underline-offset:.25rem}a:hover{color:#b3adaa}a:active{opacity:.8}
  :focus-visible{outline:2px solid #f5f3f1;outline-offset:4px}
  </style><main><h1>${html(title)}</h1>${content}</main></html>`
}

function selectionPage(state: string, installations: { id: string; accountLogin: string }[], installUrl: string) {
  const choices = installations.map((installation) => `<form method="post" action="/github/select"><input type="hidden" name="state" value="${html(state)}"><button name="installation_id" value="${html(installation.id)}">${html(installation.accountLogin)}</button></form>`).join("")

  return page("Qual conta deseja conectar?", `<p>Escolha a conta que os Bots poderão usar.</p>${choices}<p><a href="${html(installUrl)}">Instalar em outra conta</a></p>`)
}

function connectedPage(accountLogin: string) {
  return page("GitHub conectado ao Jolt", `<p>A Conta ${html(accountLogin)} foi conectada. Você pode fechar esta página e voltar ao Jolt.</p>`)
}

export function createRelayApp(input: { database: RelayDatabase; github: GithubApp }) {
  const connectionAttempts = new Map<string, { count: number; resetAt: number }>()

  function acceptsConnection(request: Request) {
    const now = Date.now()
    const address = request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() || request.headers.get("x-real-ip") || "direct"
    const current = connectionAttempts.get(address)

    if (!current || current.resetAt <= now) {
      for (const [source, attempt] of connectionAttempts) {
        if (attempt.resetAt <= now) {
          connectionAttempts.delete(source)
        }
      }

      if (!connectionAttempts.has(address) && connectionAttempts.size >= maximumConnectionSources) {
        return false
      }

      connectionAttempts.set(address, { count: 1, resetAt: now + connectionWindowMs })
      return true
    }

    if (current.count >= connectionsPerWindow) {
      return false
    }

    current.count += 1
    return true
  }

  async function complete(state: string, installationId: string) {
    const token = input.database.authenticated(state)
    const installation = await input.github.authorizeInstallation(token, installationId)
    input.database.complete(state, installation.id, installation.accountLogin)

    return connectedPage(installation.accountLogin)
  }

  return new Elysia()
    .onAfterHandle(({ set }) => {
      set.headers["cache-control"] = "no-store"
      set.headers["referrer-policy"] = "no-referrer"
    })
    .onError(({ code, error, set, request }) => {
      const unauthorized = error instanceof Error && error.message === "Unauthorized"
      const validation = code === "VALIDATION"
      set.headers["cache-control"] = "no-store"

      if (new URL(request.url).pathname.startsWith("/github/")) {
        set.status = 500

        if (unauthorized || validation) {
          set.status = unauthorized ? 401 : 400
        }

        const state = new URL(request.url).searchParams.get("state")

        if (state) {
          input.database.cancel(state)
        }
        set.headers["content-type"] = "text/html; charset=utf-8"

        if (!unauthorized && !validation) {
          console.error(error)
        }

        return page("Não foi possível conectar o GitHub", "<p>Esta tentativa expirou ou não pôde ser autorizada. Volte ao Jolt e clique em Conectar para tentar novamente.</p>")
      }

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
    .get("/health", () => ({ status: input.github.authorizationConfigured ? "ready" : "needs-configuration" }))
    .post("/v1/connections", ({ request, set }) => {
      if (!input.github.authorizationConfigured) {
        set.status = 503
        return "GitHub user authorization is not configured"
      }

      if (!acceptsConnection(request)) {
        set.status = 429
        return "Too many connection attempts"
      }

      const connection = input.database.createConnection()

      if (!connection) {
        set.status = 503
        return "Connection capacity reached"
      }

      set.status = 201

      const authorization = input.database.beginAuthorization(connection.state)

      return { connectionId: connection.id, connectionToken: connection.token, installUrl: input.github.authorizationUrl(authorization.state, authorization.verifier) }
    })
    .get("/v1/connections/:connectionId", ({ params, request }) => input.database.connection(params.connectionId, bearer(request)), {
      params: t.Object({ connectionId: t.String({ minLength: 1 }) }),
    })
    .get("/github/connect", ({ query, set }) => {
      const authorization = input.database.beginAuthorization(query.state)
      set.status = 302
      set.headers.location = input.github.authorizationUrl(authorization.state, authorization.verifier)
    }, {
      query: t.Object({ state: t.String({ minLength: 1 }) }),
    })
    .get("/github/setup", async ({ query, set }) => {
      set.headers["content-type"] = "text/html; charset=utf-8"

      if (!query.installation_id || query.setup_action === "request") {
        input.database.cancel(query.state)
        return page("Instalação aguardando aprovação", "<p>A organização precisa aprovar a instalação. Depois da aprovação, volte ao Jolt e conecte o GitHub.</p>")
      }

      return await complete(query.state, query.installation_id)
    }, {
      query: t.Object({ state: t.String({ minLength: 1 }), installation_id: t.Optional(t.String({ pattern: "^[0-9]+$" })), setup_action: t.Optional(t.String()) }),
    })
    .get("/github/authorize", async ({ query, set }) => {
      const authorization = input.database.authorization(query.state)

      if (query.error || !query.code) {
        input.database.cancel(query.state)
        set.headers["content-type"] = "text/html; charset=utf-8"
        return page("Conexão cancelada", "<p>Nenhuma conta foi conectada. Você pode voltar ao Jolt e tentar novamente.</p>")
      }

      const userToken = await input.github.exchangeAuthorization(query.code, authorization.verifier)
      const state = input.database.finishAuthorization(query.state, userToken)
      set.status = 303
      set.headers.location = `/github/select?state=${encodeURIComponent(state)}`
    }, {
      query: t.Object({ state: t.String({ minLength: 1 }), code: t.Optional(t.String({ minLength: 1 })), error: t.Optional(t.String()) }),
    })
    .get("/github/select", async ({ query, set }) => {
      const token = input.database.authenticated(query.state)
      const installations = await input.github.installations(token)
      set.headers["content-type"] = "text/html; charset=utf-8"

      if (installations.length === 1) {
        return await complete(query.state, installations[0].id)
      }

      if (installations.length === 0) {
        set.status = 302
        set.headers.location = input.github.installUrl(query.state)
        return
      }

      return selectionPage(query.state, installations, input.github.installUrl(query.state))
    }, {
      query: t.Object({ state: t.String({ minLength: 1 }) }),
    })
    .post("/github/select", async ({ body, request, set }) => {
      if (!acceptsConnection(request)) {
        set.status = 429
        return "Too many connection attempts"
      }

      set.headers["content-type"] = "text/html; charset=utf-8"
      return await complete(body.state, body.installation_id)
    }, {
      body: t.Object({ state: t.String({ minLength: 1 }), installation_id: t.String({ pattern: "^[0-9]+$" }) }),
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
    .delete("/v1/installations/:installationId/connection", ({ params, request, set }) => {
      input.database.revoke(params.installationId, bearer(request))
      set.status = 204
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
