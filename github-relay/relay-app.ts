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
  form{display:grid;gap:.75rem;margin:2rem 0}input,button{font:inherit;border-radius:.5rem;padding:.75rem}
  input{width:100%;border:1px solid #b3adaa;background:transparent;color:inherit}
  button{border:0;background:#f5f3f1;color:#0c0a09;cursor:pointer}button:hover{background:#b3adaa}button:active{opacity:.8}
  a{color:inherit;text-underline-offset:.25rem}a:hover{color:#b3adaa}a:active{opacity:.8}
  :focus-visible{outline:2px solid #f5f3f1;outline-offset:4px}
  </style><main><h1>${html(title)}</h1>${content}</main></html>`
}

function connectionPage(state: string, installUrl: string, account = "", error?: string) {
  return page("Conectar GitHub ao Jolt", `<p>Se o App já está instalado, informe a conta pessoal ou organização que deseja conectar.</p>
  <form method="post" action="/github/connect">
  <input type="hidden" name="state" value="${html(state)}">
  <label for="account">Conta do GitHub</label>
  <input id="account" name="account" value="${html(account)}" placeholder="octocat" required maxlength="39" pattern="[A-Za-z0-9][A-Za-z0-9-]{0,38}" autocomplete="username" spellcheck="false" autocapitalize="none"${error ? ' aria-describedby="error" aria-invalid="true"' : ""}>
  ${error ? `<p id="error" role="alert">${html(error)}</p>` : ""}
  <button type="submit">Continuar com GitHub</button></form>
  <p>Ainda não instalou o App? <a href="${html(installUrl)}">Instalar em uma conta nova</a></p>`)
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

      return { connectionId: connection.id, connectionToken: connection.token, installUrl: input.github.connectionUrl(connection.state) }
    })
    .get("/v1/connections/:connectionId", ({ params, request }) => input.database.connection(params.connectionId, bearer(request)), {
      params: t.Object({ connectionId: t.String({ minLength: 1 }) }),
    })
    .get("/github/connect", ({ query, set }) => {
      input.database.pending(query.state)
      set.headers["content-type"] = "text/html; charset=utf-8"

      return connectionPage(query.state, input.github.installUrl(query.state))
    }, {
      query: t.Object({ state: t.String({ minLength: 1 }) }),
    })
    .post("/github/connect", async ({ body, request, set }) => {
      input.database.pending(body.state)

      if (!acceptsConnection(request)) {
        set.status = 429
        return "Too many connection attempts"
      }

      const installed = await input.github.findInstallation(body.account)

      if (!installed || installed.suspended_at) {
        set.status = 400
        set.headers["content-type"] = "text/html; charset=utf-8"

        return connectionPage(body.state, input.github.installUrl(body.state), body.account, "Não encontramos uma instalação ativa nessa conta. Confira o nome ou instale o App.")
      }

      const authorization = input.database.beginAuthorization(body.state, installed.id)
      set.status = 303
      set.headers.location = input.github.authorizationUrl(authorization.state, authorization.verifier)
    }, {
      body: t.Object({ state: t.String({ minLength: 1 }), account: t.String({ pattern: "^[A-Za-z0-9][A-Za-z0-9-]{0,38}$" }) }),
    })
    .get("/github/setup", ({ query, set }) => {
      if (!input.github.authorizationConfigured) {
        set.status = 503
        return "GitHub user authorization is not configured"
      }

      const authorization = input.database.beginAuthorization(query.state, query.installation_id)
      set.status = 302
      set.headers.location = input.github.authorizationUrl(authorization.state, authorization.verifier)
    }, {
      query: t.Object({ state: t.String({ minLength: 1 }), installation_id: t.String({ pattern: "^[0-9]+$" }) }),
    })
    .get("/github/authorize", async ({ query, set }) => {
      const authorization = input.database.authorization(query.state)
      const installation = await input.github.authorizeInstallation(query.code, authorization.verifier, authorization.installationId)
      input.database.complete(query.state, installation.id, installation.accountLogin)
      set.headers["content-type"] = "text/html; charset=utf-8"

      return connectedPage(installation.accountLogin)
    }, {
      query: t.Object({ state: t.String({ minLength: 1 }), code: t.String({ minLength: 1 }) }),
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
