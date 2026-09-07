import { createHash } from "node:crypto"
import { z } from "zod"
import { parse } from "@src/shared/parse"
import { PluginAuthError } from "../plugin-adapter"

const closeDelayMs = 50

const gmailScopes = ["https://www.googleapis.com/auth/gmail.modify"]

const authorizationEndpoint = "https://accounts.google.com/o/oauth2/v2/auth"
const tokenEndpoint = "https://oauth2.googleapis.com/token"

export interface GmailClient { id: string; secret?: string }

const tokenResponse = z.looseObject({ access_token: z.string().min(1), refresh_token: z.string().min(1).optional(), expires_in: z.number() })
const tokenFailure = z.looseObject({ error: z.string().optional(), error_description: z.string().optional() })
const credentialsSchema = z.strictObject({ accessToken: z.string().min(1), refreshToken: z.string().min(1), expiresAt: z.string().min(1) })

export type GmailCredentials = z.infer<typeof credentialsSchema>

const pages = {
  connected: { title: "Gmail conectado", detail: "Pode fechar esta aba e voltar para o Mimo.", tone: "#4ade80" },
  denied: { title: "O Google não permitiu a conexão", detail: "Pode fechar esta aba e tentar de novo no Mimo.", tone: "#f87171" },
  failed: { title: "O Mimo não conseguiu concluir a conexão", detail: "Pode fechar esta aba e tentar de novo no Mimo.", tone: "#f87171" },
  wrongState: { title: "Este link não é o que o Mimo está esperando", detail: "Volte ao Mimo e conecte o Gmail de novo.", tone: "#f87171" },
}

function page(content: (typeof pages)[keyof typeof pages], status: number) {
  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${content.title} · Mimo</title>
<style>
body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #0c0a09; color: #f5f3f1; font: 16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 26rem; margin: 1.5rem; padding: 2rem; background: #151311; border: 1px solid #302c29; border-radius: 1.5rem; }
span { display: block; width: 0.625rem; height: 0.625rem; margin-bottom: 1rem; border-radius: 999px; background: ${content.tone}; }
h1 { margin: 0 0 0.5rem; font-size: 1.25rem; font-weight: 600; }
p { margin: 0; color: #b3adaa; }
</style>
</head>
<body>
<main>
<span></span>
<h1>${content.title}</h1>
<p>${content.detail}</p>
</main>
</body>
</html>
`

  return new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8" } })
}

export function parseCredentials(secret: string) {
  return parse(credentialsSchema, JSON.parse(secret))
}

function base64url(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64url")
}

function challenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url")
}

async function exchange(client: GmailClient, body: Record<string, string>, previousRefreshToken?: string): Promise<GmailCredentials> {
  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: client.id, ...(client.secret ? { client_secret: client.secret } : {}), ...body }),
  })
  const payload: unknown = await response.json().catch(() => ({}))

  if (!response.ok) {
    const failure = parse(tokenFailure, payload)
    const reason = failure.error_description ?? failure.error ?? `HTTP ${response.status}`

    if (failure.error === "invalid_grant") {
      throw new PluginAuthError(reason)
    }

    throw new Error(`Google refused the token request: ${reason}`)
  }

  const token = parse(tokenResponse, payload)
  const refreshToken = token.refresh_token ?? previousRefreshToken

  if (!refreshToken) {
    throw new Error("Google did not return a refresh token")
  }

  return { accessToken: token.access_token, refreshToken, expiresAt: new Date(Date.now() + token.expires_in * 1000).toISOString() }
}

export function refreshCredentials(client: GmailClient, credentials: GmailCredentials) {
  return exchange(client, { grant_type: "refresh_token", refresh_token: credentials.refreshToken }, credentials.refreshToken)
}

export function startAuthorization(client: GmailClient) {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)))
  const state = crypto.randomUUID()
  const settle = Promise.withResolvers<GmailCredentials>()
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const url = new URL(request.url)

      if (url.pathname !== "/callback") {
        return new Response("Not found", { status: 404 })
      }

      if (url.searchParams.get("state") !== state) {
        return page(pages.wrongState, 400)
      }

      const code = url.searchParams.get("code")

      if (!code) {
        return finish({ error: new Error(url.searchParams.get("error") ?? "Google did not return a code") }, page(pages.denied, 400))
      }

      try {
        const exchanged = await exchange(client, { grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: redirectUri })

        return finish({ credentials: exchanged }, page(pages.connected, 200))
      } catch (error) {
        return finish({ error: error instanceof Error ? error : new Error("Token exchange failed") }, page(pages.failed, 500))
      }
    },
  })

  function finish(outcome: { credentials: GmailCredentials } | { error: Error }, response: Response) {
    setTimeout(() => {
      void server.stop(true)

      if ("error" in outcome) {
        settle.reject(outcome.error)

        return
      }

      settle.resolve(outcome.credentials)
    }, closeDelayMs)

    return response
  }
  const redirectUri = `http://127.0.0.1:${server.port}/callback`
  const authorizationUrl = new URL(authorizationEndpoint)
  authorizationUrl.search = new URLSearchParams({
    client_id: client.id,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: gmailScopes.join(" "),
    code_challenge: challenge(verifier),
    code_challenge_method: "S256",
    state,
    access_type: "offline",
    prompt: "consent",
  }).toString()

  return {
    authorizationUrl: authorizationUrl.toString(),
    credentials: settle.promise,
    cancel: () => {
      void server.stop(true)
      settle.reject(new Error("Connection cancelled"))
    },
  }
}
