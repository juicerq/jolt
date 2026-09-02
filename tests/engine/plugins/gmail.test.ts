import { afterEach, describe, expect, test } from "bun:test"
import { join } from "node:path"
import { createObservationSystem } from "@src/engine/observability/observability"
import { createGmailAdapter, gmailSearchConcurrency, gmailTools } from "@src/engine/plugins/gmail/gmail"
import { PluginAuthError } from "@src/engine/plugins/plugin-adapter"
import { testDirectory } from "../../support/test-directory"

const directory = testDirectory("jolt-gmail-")

type Fake = { requests: { method: string; path: string; body: string; authorization: string | null }[]; tokens: string[]; refreshOutcome: "ok" | "invalid_grant"; rateLimits: number; inFlight: number; peakInFlight: number; drafts: Map<string, { to: string; subject: string; threadId?: string }>; sent: string[]; delivered: { to: string; subject: string; inReplyTo: string; threadId?: string }[]; labels: Map<string, Set<string>> }

function fakeGoogle() {
  const state: Fake = { requests: [], tokens: [], refreshOutcome: "ok", rateLimits: 0, inFlight: 0, peakInFlight: 0, drafts: new Map(), sent: [], delivered: [], labels: new Map([["m1", new Set(["INBOX", "UNREAD"])], ["m3", new Set(["INBOX", "UNREAD"])]]) }
  let tokenCounter = 0
  const encoded = (text: string) => Buffer.from(text).toString("base64url")
  const message = (id: string) => ({ id, threadId: `t-${id}`, snippet: `snippet ${id}`, labelIds: [...(state.labels.get(id) ?? [])], payload: { mimeType: "text/plain", headers: [{ name: "From", value: "bob@example.com" }, { name: "To", value: "ana@example.com" }, { name: "Subject", value: `Subject ${id}` }, { name: "Message-ID", value: `<${id}@example.com>` }, { name: "Date", value: "Mon, 1 Sep 2026 10:00:00 +0000" }], body: { data: encoded(`body of ${id}`) } } })
  const parseRaw = (raw: string) => {
    const text = Buffer.from(raw, "base64url").toString("utf8")

    return { to: text.match(/^To: (.*)$/m)?.[1] ?? "", subject: text.match(/^Subject: (.*)$/m)?.[1] ?? "", inReplyTo: text.match(/^In-Reply-To: (.*)$/m)?.[1] ?? "" }
  }
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const url = new URL(request.url)
      const body = await request.text()
      state.requests.push({ method: request.method, path: url.pathname + url.search, body, authorization: request.headers.get("authorization") })

      if (url.pathname === "/token") {
        const form = new URLSearchParams(body)

        if (form.get("grant_type") === "refresh_token" && state.refreshOutcome === "invalid_grant") {
          return Response.json({ error: "invalid_grant", error_description: "Token has been revoked" }, { status: 400 })
        }

        const token = `access-${++tokenCounter}`
        state.tokens.push(token)

        return Response.json({ access_token: token, refresh_token: form.get("grant_type") === "authorization_code" ? "refresh-1" : undefined, expires_in: 3600, token_type: "Bearer" })
      }

      const authorization = request.headers.get("authorization")
      const current = state.tokens.at(-1)

      if (authorization !== `Bearer ${current}`) {
        return Response.json({ error: { message: "Invalid Credentials" } }, { status: 401 })
      }

      if (url.pathname === "/gmail/users/me/profile") {
        return Response.json({ emailAddress: "ana@example.com" })
      }

      if (url.pathname === "/gmail/users/me/messages") {
        if (url.searchParams.get("q") === "many") {
          return Response.json({ messages: Array.from({ length: 12 }, (_, index) => ({ id: `m${index + 1}`, threadId: `t-m${index + 1}` })) })
        }

        return Response.json({ messages: url.searchParams.get("q") === "nothing" ? [] : [{ id: "m1", threadId: "t-m1" }, { id: "m2", threadId: "t-m2" }] })
      }

      if (url.pathname === "/gmail/users/me/messages/send") {
        const payload = JSON.parse(body) as { raw: string; threadId?: string }
        state.delivered.push({ ...parseRaw(payload.raw), threadId: payload.threadId })

        return Response.json({ id: `sent-${state.delivered.length}`, threadId: payload.threadId ?? "t-new" })
      }

      if (url.pathname.startsWith("/gmail/users/me/messages/")) {
        if (state.rateLimits > 0) {
          state.rateLimits -= 1

          return Response.json({ error: { message: "Too many concurrent requests for user." } }, { status: 429 })
        }

        state.inFlight += 1
        state.peakInFlight = Math.max(state.peakInFlight, state.inFlight)
        await Bun.sleep(10)
        state.inFlight -= 1

        return Response.json(message(url.pathname.split("/").at(-1) ?? ""))
      }

      if (url.pathname === "/gmail/users/me/labels") {
        return Response.json({ labels: [{ id: "INBOX", name: "INBOX", type: "system" }, { id: "UNREAD", name: "UNREAD", type: "system" }, { id: "TRASH", name: "TRASH", type: "system" }, { id: "Label_7", name: "Clientes", type: "user" }] })
      }

      if (url.pathname === "/gmail/users/me/threads/t-m1/modify") {
        const change = JSON.parse(body) as { addLabelIds?: string[]; removeLabelIds?: string[] }

        for (const id of ["m1", "m3"]) {
          const labels = state.labels.get(id) ?? new Set()
          change.addLabelIds?.forEach((label) => labels.add(label))
          change.removeLabelIds?.forEach((label) => labels.delete(label))
        }

        return Response.json({ id: "t-m1" })
      }

      if (url.pathname === "/gmail/users/me/threads/t-m1/trash") {
        for (const id of ["m1", "m3"]) {
          state.labels.get(id)?.add("TRASH")
          state.labels.get(id)?.delete("INBOX")
        }

        return Response.json({ id: "t-m1" })
      }

      if (url.pathname.startsWith("/gmail/users/me/threads/")) {
        return Response.json({ id: "t-m1", messages: [message("m1"), message("m3")] })
      }

      if (url.pathname === "/gmail/users/me/drafts" && request.method === "POST") {
        const parsed = parseRaw(JSON.parse(body).message.raw)
        const id = `d-${state.drafts.size + 1}`
        state.drafts.set(id, { to: parsed.to, subject: parsed.subject, threadId: JSON.parse(body).message.threadId })

        return Response.json({ id, message: { id: `dm-${id}` } })
      }

      if (url.pathname === "/gmail/users/me/drafts/send") {
        const id = JSON.parse(body).id
        const draft = state.drafts.get(id)

        if (!draft) {
          return Response.json({ error: { message: "Draft not found" } }, { status: 404 })
        }

        state.sent.push(id)

        return Response.json({ id, message: { id: `sent-${id}`, threadId: "t-x" } })
      }

      if (url.pathname.startsWith("/gmail/users/me/drafts/")) {
        const id = url.pathname.split("/").at(-1) ?? ""

        return state.drafts.has(id) ? Response.json({ id, message: { id: `dm-${id}` } }) : Response.json({ error: { message: "Draft not found" } }, { status: 404 })
      }

      return Response.json({ error: { message: `No route ${url.pathname}` } }, { status: 404 })
    },
  })
  const base = `http://127.0.0.1:${server.port}`

  return {
    state,
    endpoints: { authorization: `${base}/authorize`, token: `${base}/token`, api: `${base}/gmail` },
    stop: () => server.stop(true),
  }
}

function tool(name: string) {
  const found = gmailTools.find((candidate) => candidate.name === name)

  if (!found) {
    throw new Error(`No tool ${name}`)
  }

  return found
}

describe("gmail adapter", () => {
  const stops: (() => void)[] = []

  afterEach(() => {
    for (const stop of stops.splice(0)) {
      stop()
    }
  })

  function setup() {
    const google = fakeGoogle()
    stops.push(google.stop)
    const system = createObservationSystem({ appSessionId: crypto.randomUUID(), logDirectory: join(directory, "logs"), development: false })
    const adapter = createGmailAdapter({ observability: system.observability, client: { id: "client-1" }, endpoints: google.endpoints })

    return { google, adapter }
  }

  async function connected(environment: ReturnType<typeof setup>) {
    const connection = environment.adapter.connect({ pluginId: "gmail", name: "Gmail" })
    const url = new URL(connection.authorizationUrl ?? "")
    const redirect = new URL(url.searchParams.get("redirect_uri") ?? "")
    redirect.searchParams.set("code", "code-1")
    redirect.searchParams.set("state", url.searchParams.get("state") ?? "")
    const page = await fetch(redirect)
    const result = await connection.connected

    return { url, page, result }
  }

  test("connect signs in through the loopback callback with PKCE and reads the profile", async () => {
    const environment = setup()
    const { url, page, result } = await connected(environment)

    expect(url.searchParams.get("client_id")).toBe("client-1")
    expect(url.searchParams.get("code_challenge_method")).toBe("S256")
    expect(url.searchParams.get("scope")).toBe("https://www.googleapis.com/auth/gmail.modify")
    expect(page.status).toBe(200)
    expect(result.label).toBe("ana@example.com")
    expect(result.tools.map((item) => item.name)).toEqual(["gmail_search", "gmail_read_thread", "gmail_create_draft", "gmail_send_draft", "gmail_send", "gmail_reply", "gmail_archive", "gmail_mark_read", "gmail_label", "gmail_trash", "gmail_list_labels"])
    expect(JSON.parse(result.secret)).toMatchObject({ accessToken: "access-1", refreshToken: "refresh-1" })
    const exchange = environment.google.state.requests.find((request) => request.path === "/token")
    expect(new URLSearchParams(exchange?.body).get("code_verifier")).toBeTruthy()
  })

  test("a wrong state or a denied sign-in never completes the connection", async () => {
    const environment = setup()
    const connection = environment.adapter.connect({ pluginId: "gmail", name: "Gmail" })
    const url = new URL(connection.authorizationUrl ?? "")
    const redirect = new URL(url.searchParams.get("redirect_uri") ?? "")
    redirect.searchParams.set("code", "code-1")
    redirect.searchParams.set("state", "other")
    expect((await fetch(redirect)).status).toBe(400)

    redirect.searchParams.set("state", url.searchParams.get("state") ?? "")
    redirect.searchParams.delete("code")
    redirect.searchParams.set("error", "access_denied")
    const failure = connection.connected.then(() => "connected", (error: Error) => error.message)
    expect((await fetch(redirect)).status).toBe(400)
    expect(await failure).toBe("access_denied")
  })

  test("search and read use the token, refresh it when Gmail rejects it, and report a revoked Conta", async () => {
    const environment = setup()
    const { result } = await connected(environment)
    const saved: string[] = []
    const account = { id: "a1", pluginId: "gmail", label: "ana@example.com", secret: result.secret, saveSecret: (secret: string) => saved.push(secret) }

    const listing = await environment.adapter.execute(account, tool("gmail_search"), { query: "from:bob", limit: "2" })
    expect(listing).toContain("id: m1")
    expect(listing).toContain("subject: Subject m2")
    expect(await environment.adapter.execute(account, tool("gmail_search"), { query: "nothing" })).toBe("No messages match.")

    const thread = await environment.adapter.execute(account, tool("gmail_read_thread"), { threadId: "t-m1" })
    expect(thread).toContain("body of m1")
    expect(thread).toContain("body of m3")

    environment.google.state.tokens.push("rotated-elsewhere")
    expect(await environment.adapter.execute(account, tool("gmail_search"), { query: "x" })).toContain("id: m1")
    expect(JSON.parse(saved.at(-1) ?? "{}")).toMatchObject({ accessToken: "access-2", refreshToken: "refresh-1" })

    environment.google.state.tokens.push("rotated-again")
    environment.google.state.refreshOutcome = "invalid_grant"
    await expect(environment.adapter.execute(account, tool("gmail_search"), { query: "x" })).rejects.toBeInstanceOf(PluginAuthError)
  })

  test("search reads messages a few at a time and retries once when Gmail limits the rate", async () => {
    const environment = setup()
    const { result } = await connected(environment)
    const account = { id: "a1", pluginId: "gmail", label: "ana@example.com", secret: result.secret, saveSecret: () => undefined }
    environment.google.state.rateLimits = 1

    const listing = await environment.adapter.execute(account, tool("gmail_search"), { query: "many", limit: "12" })

    expect(listing.match(/^id: m\d+$/gm)).toHaveLength(12)
    expect(environment.google.state.peakInFlight).toBeLessThanOrEqual(gmailSearchConcurrency)
    expect(environment.google.state.requests.filter((request) => request.path.startsWith("/gmail/users/me/messages/m1?"))).toHaveLength(2)
  })

  test("a draft is verified after creation and sending confirms the delivered message", async () => {
    const environment = setup()
    const { result } = await connected(environment)
    const account = { id: "a1", pluginId: "gmail", label: "ana@example.com", secret: result.secret, saveSecret() {} }

    const created = await environment.adapter.execute(account, tool("gmail_create_draft"), { to: "bob@example.com", subject: "Olá", body: "Tudo bem?", threadId: "t-m1" })
    expect(created).toContain("Draft d-1 saved")
    expect(environment.google.state.drafts.get("d-1")).toEqual({ to: "bob@example.com", subject: "Olá", threadId: "t-m1" })
    expect(environment.google.state.requests.filter((request) => request.path === "/gmail/users/me/drafts/d-1")).toHaveLength(1)

    const sent = await environment.adapter.execute(account, tool("gmail_send_draft"), { draftId: "d-1" })
    expect(sent).toBe('Sent. Message sent-d-1 to ana@example.com with subject "Subject sent-d-1".')
    expect(environment.google.state.sent).toEqual(["d-1"])
    await expect(environment.adapter.execute(account, tool("gmail_send_draft"), { draftId: "d-9" })).rejects.toThrow("Draft not found")
  })

  test("send and reply deliver through Gmail and confirm the delivered message", async () => {
    const environment = setup()
    const { result } = await connected(environment)
    const account = { id: "a1", pluginId: "gmail", label: "ana@example.com", secret: result.secret, saveSecret() {} }

    const sent = await environment.adapter.execute(account, tool("gmail_send"), { to: "bob@example.com", subject: "Oi", body: "Direto" })
    expect(sent).toBe('Sent. Message sent-1 to ana@example.com with subject "Subject sent-1".')
    expect(environment.google.state.delivered[0]).toEqual({ to: "bob@example.com", subject: "Oi", inReplyTo: "", threadId: undefined })

    const replied = await environment.adapter.execute(account, tool("gmail_reply"), { threadId: "t-m1", body: "Respondendo" })
    expect(replied).toContain("Replied in thread t-m1")
    expect(environment.google.state.delivered[1]).toEqual({ to: "bob@example.com", subject: "Re: Subject m3", inReplyTo: "<m3@example.com>", threadId: "t-m1" })
  })

  test("archive, mark read, label and trash change the thread and are verified by reading it back", async () => {
    const environment = setup()
    const { result } = await connected(environment)
    const account = { id: "a1", pluginId: "gmail", label: "ana@example.com", secret: result.secret, saveSecret() {} }
    const labels = () => [...(environment.google.state.labels.get("m3") ?? [])].sort()

    expect(await environment.adapter.execute(account, tool("gmail_list_labels"), {})).toBe("INBOX\nUNREAD\nTRASH\nClientes")
    expect(await environment.adapter.execute(account, tool("gmail_mark_read"), { threadId: "t-m1" })).toContain("labels: INBOX")
    expect(labels()).toEqual(["INBOX"])
    expect(await environment.adapter.execute(account, tool("gmail_mark_read"), { threadId: "t-m1", read: false })).toContain("UNREAD")
    expect(labels()).toEqual(["INBOX", "UNREAD"])
    expect(await environment.adapter.execute(account, tool("gmail_label"), { threadId: "t-m1", add: ["Clientes"], remove: ["UNREAD"] })).toContain("labels: Clientes, INBOX")
    expect(labels()).toEqual(["INBOX", "Label_7"])
    await expect(environment.adapter.execute(account, tool("gmail_label"), { threadId: "t-m1", add: ["Nope"] })).rejects.toThrow('No Gmail label named "Nope". Available: INBOX, UNREAD, TRASH, Clientes')
    expect(await environment.adapter.execute(account, tool("gmail_archive"), { threadId: "t-m1" })).toBe("Thread t-m1 archived. labels: Clientes")
    expect(labels()).toEqual(["Label_7"])
    expect(await environment.adapter.execute(account, tool("gmail_trash"), { threadId: "t-m1" })).toBe("Thread t-m1 moved to trash. labels: Clientes, TRASH")
    expect(labels()).toEqual(["Label_7", "TRASH"])
  })

  test("without a Google client id the Plugin says how to enable it", () => {
    const system = createObservationSystem({ appSessionId: crypto.randomUUID(), logDirectory: join(directory, "logs"), development: false })
    const adapter = createGmailAdapter({ observability: system.observability })

    expect(adapter.availability()).toEqual({ available: false, reason: "Gmail needs a Google client id. Set JOLT_GOOGLE_CLIENT_ID before starting Jolt." })
    expect(() => adapter.connect({ pluginId: "gmail", name: "Gmail" })).toThrow("JOLT_GOOGLE_CLIENT_ID")
  })
})
