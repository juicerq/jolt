import { createHash } from "node:crypto"
import { z } from "zod"
import { parse } from "@src/shared/parse"
import { PluginAuthError } from "../plugin-adapter"

const closeDelayMs = 50

export const gmailScopes = ["https://www.googleapis.com/auth/gmail.modify"]

export interface GmailEndpoints { authorization: string; token: string; api: string }

export const googleEndpoints: GmailEndpoints = {
  authorization: "https://accounts.google.com/o/oauth2/v2/auth",
  token: "https://oauth2.googleapis.com/token",
  api: "https://gmail.googleapis.com/gmail/v1",
}

export interface GmailClient { id: string; secret?: string }

const tokenResponse = z.looseObject({ access_token: z.string().min(1), refresh_token: z.string().min(1).optional(), expires_in: z.number() })
const tokenFailure = z.looseObject({ error: z.string().optional(), error_description: z.string().optional() })
const credentialsSchema = z.strictObject({ accessToken: z.string().min(1), refreshToken: z.string().min(1), expiresAt: z.string().min(1) })

export type GmailCredentials = z.infer<typeof credentialsSchema>

export function parseCredentials(secret: string) {
  return parse(credentialsSchema, JSON.parse(secret))
}

function base64url(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64url")
}

function challenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url")
}

async function exchange(endpoint: string, client: GmailClient, body: Record<string, string>, previousRefreshToken?: string): Promise<GmailCredentials> {
  const response = await fetch(endpoint, {
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

export function refreshCredentials(endpoints: GmailEndpoints, client: GmailClient, credentials: GmailCredentials) {
  return exchange(endpoints.token, client, { grant_type: "refresh_token", refresh_token: credentials.refreshToken }, credentials.refreshToken)
}

export function startAuthorization(endpoints: GmailEndpoints, client: GmailClient) {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)))
  const state = crypto.randomUUID()
  let settle: { resolve(credentials: GmailCredentials): void; reject(error: Error): void } | undefined
  const credentials = new Promise<GmailCredentials>((resolve, reject) => {
    settle = { resolve, reject }
  })
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const url = new URL(request.url)

      if (url.pathname !== "/callback") {
        return new Response("Not found", { status: 404 })
      }

      if (url.searchParams.get("state") !== state) {
        return new Response("This sign-in link is not the one Jolt is waiting for.", { status: 400 })
      }

      const code = url.searchParams.get("code")

      if (!code) {
        return finish({ error: new Error(url.searchParams.get("error") ?? "Google did not return a code") }, new Response("Google did not allow the connection. You can close this tab.", { status: 400 }))
      }

      try {
        const exchanged = await exchange(endpoints.token, client, { grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: redirectUri })

        return finish({ credentials: exchanged }, new Response("Gmail connected. You can close this tab and go back to Jolt."))
      } catch (error) {
        return finish({ error: error instanceof Error ? error : new Error("Token exchange failed") }, new Response("Jolt could not finish the connection. You can close this tab.", { status: 500 }))
      }
    },
  })

  function finish(outcome: { credentials: GmailCredentials } | { error: Error }, response: Response) {
    setTimeout(() => {
      void server.stop(true)

      if ("error" in outcome) {
        settle?.reject(outcome.error)

        return
      }

      settle?.resolve(outcome.credentials)
    }, closeDelayMs)

    return response
  }
  const redirectUri = `http://127.0.0.1:${server.port}/callback`
  const authorizationUrl = new URL(endpoints.authorization)
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
    credentials,
    cancel: () => {
      void server.stop(true)
      settle?.reject(new Error("Connection cancelled"))
    },
  }
}
