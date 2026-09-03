import { z } from "zod"
import { parse } from "../../../shared/parse"
import type { ToolDescriptor } from "../../../shared/plugins"
import type { Observability } from "../../observability/observability"
import { PluginAuthError, type PluginAccountSession, type PluginAdapter } from "../plugin-adapter"
import { googleEndpoints, parseCredentials, refreshCredentials, startAuthorization, type GmailClient, type GmailCredentials, type GmailEndpoints } from "./gmail-oauth"

export const gmailSearchConcurrency = 5
const rateLimitRetryDelayMs = 400

const header = z.looseObject({ name: z.string(), value: z.string() })
const part: z.ZodType<{ mimeType?: string; body?: { data?: string }; parts?: unknown[] }> = z.looseObject({
  mimeType: z.string().optional(),
  body: z.looseObject({ data: z.string().optional() }).optional(),
  parts: z.array(z.unknown()).optional(),
})
const message = z.looseObject({
  id: z.string(),
  threadId: z.string(),
  snippet: z.string().optional(),
  labelIds: z.array(z.string()).optional(),
  payload: z.looseObject({ headers: z.array(header).optional(), mimeType: z.string().optional(), body: z.looseObject({ data: z.string().optional() }).optional(), parts: z.array(z.unknown()).optional() }).optional(),
})
const schemas = {
  profile: z.looseObject({ emailAddress: z.string().min(1) }),
  messageList: z.looseObject({ messages: z.array(z.looseObject({ id: z.string(), threadId: z.string() })).optional() }),
  message,
  thread: z.looseObject({ id: z.string(), messages: z.array(message).optional() }),
  draft: z.looseObject({ id: z.string(), message: z.looseObject({ id: z.string(), threadId: z.string().optional() }).optional() }),
  sent: z.looseObject({ id: z.string(), threadId: z.string().optional() }),
  labelList: z.looseObject({ labels: z.array(z.looseObject({ id: z.string(), name: z.string() })).optional() }),
  failure: z.looseObject({ error: z.looseObject({ message: z.string().optional() }).optional() }),
}
const inputs = {
  gmail_search: z.object({ query: z.string().min(1), limit: z.coerce.number().int().min(1).max(50).default(10) }),
  gmail_read_thread: z.object({ threadId: z.string().min(1) }),
  gmail_create_draft: z.object({ to: z.string().min(1), subject: z.string(), body: z.string(), cc: z.string().optional(), threadId: z.string().optional() }),
  gmail_send_draft: z.object({ draftId: z.string().min(1) }),
  gmail_send: z.object({ to: z.string().min(1), subject: z.string(), body: z.string(), cc: z.string().optional() }),
  gmail_reply: z.object({ threadId: z.string().min(1), body: z.string(), cc: z.string().optional() }),
  gmail_thread: z.object({ threadId: z.string().min(1) }),
  gmail_mark_read: z.object({ threadId: z.string().min(1), read: z.coerce.boolean().default(true) }),
  gmail_label: z.object({ threadId: z.string().min(1), add: z.array(z.string().min(1)).default([]), remove: z.array(z.string().min(1)).default([]) }),
}
const threadInput = { type: "object", properties: { threadId: { type: "string", description: "Thread id from gmail_search" } }, required: ["threadId"] } satisfies ToolDescriptor["inputSchema"]

export const gmailTools: ToolDescriptor[] = [
  {
    name: "gmail_search",
    label: "Pesquisa no Gmail",
    description: "Search the person's Gmail with Gmail search syntax (from:, subject:, newer_than:2d, is:unread). Returns id, threadId, date, sender, subject and a snippet per message.",
    inputSchema: { type: "object", properties: { query: { type: "string", description: "Gmail search query" }, limit: { type: "number", description: "Maximum messages, default 10, up to 50" } }, required: ["query"] },
  },
  {
    name: "gmail_read_thread",
    label: "Leitura de conversa do Gmail",
    description: "Read every message of a Gmail thread, with headers and plain-text body.",
    inputSchema: { type: "object", properties: { threadId: { type: "string", description: "Thread id from gmail_search" } }, required: ["threadId"] },
  },
  {
    name: "gmail_create_draft",
    label: "Rascunho no Gmail",
    description: "Create a draft in the person's Gmail. Nothing is sent. Pass threadId to draft a reply inside a thread.",
    inputSchema: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipients, comma separated" },
        subject: { type: "string" },
        body: { type: "string", description: "Plain-text body" },
        cc: { type: "string", description: "Copy recipients, comma separated" },
        threadId: { type: "string", description: "Thread to reply in" },
      },
      required: ["to", "subject", "body"],
    },
  },
  {
    name: "gmail_send_draft",
    label: "Envio de rascunho do Gmail",
    description: "Send a draft created with gmail_create_draft. The message leaves the person's Gmail.",
    inputSchema: { type: "object", properties: { draftId: { type: "string", description: "Draft id from gmail_create_draft" } }, required: ["draftId"] },
  },
  {
    name: "gmail_send",
    label: "Envio de email pelo Gmail",
    description: "Send a new email from the person's Gmail right away, without a draft.",
    inputSchema: {
      type: "object",
      properties: { to: { type: "string", description: "Recipients, comma separated" }, subject: { type: "string" }, body: { type: "string", description: "Plain-text body" }, cc: { type: "string", description: "Copy recipients, comma separated" } },
      required: ["to", "subject", "body"],
    },
  },
  {
    name: "gmail_reply",
    label: "Resposta em conversa do Gmail",
    description: "Reply to the latest message of a thread and send it right away. Recipient and subject come from the thread.",
    inputSchema: { type: "object", properties: { threadId: { type: "string", description: "Thread id from gmail_search" }, body: { type: "string", description: "Plain-text body" }, cc: { type: "string", description: "Copy recipients, comma separated" } }, required: ["threadId", "body"] },
  },
  { name: "gmail_archive", label: "Arquivamento de conversa do Gmail", description: "Remove a thread from the inbox. The messages stay in All Mail.", inputSchema: threadInput },
  {
    name: "gmail_mark_read",
    label: "Marcação de conversa do Gmail como lida",
    description: "Mark a thread as read, or as unread with read=false.",
    inputSchema: { type: "object", properties: { threadId: { type: "string", description: "Thread id from gmail_search" }, read: { type: "boolean", description: "true marks read, false marks unread. Default true" } }, required: ["threadId"] },
  },
  {
    name: "gmail_label",
    label: "Mudança de marcadores no Gmail",
    description: "Add or remove labels on a thread by label name. Use gmail_list_labels to see the names.",
    inputSchema: { type: "object", properties: { threadId: { type: "string", description: "Thread id from gmail_search" }, add: { type: "array", items: { type: "string" }, description: "Label names to add" }, remove: { type: "array", items: { type: "string" }, description: "Label names to remove" } }, required: ["threadId"] },
  },
  { name: "gmail_trash", label: "Envio de conversa do Gmail para a lixeira", description: "Move a thread to the trash. Gmail keeps it there for 30 days.", inputSchema: threadInput },
  { name: "gmail_list_labels", label: "Lista de marcadores do Gmail", description: "List the label names of the person's Gmail, system and custom.", inputSchema: { type: "object", properties: {} } },
]

type Part = z.infer<typeof part>

function headerValue(headers: { name: string; value: string }[] | undefined, name: string) {
  return headers?.find((candidate) => candidate.name.toLowerCase() === name.toLowerCase())?.value ?? ""
}

function plainText(payload: Part | undefined): string {
  if (!payload) {
    return ""
  }

  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return Buffer.from(payload.body.data, "base64url").toString("utf8")
  }

  const parts = (payload.parts ?? []).flatMap((child) => {
    const parsed = part.safeParse(child)

    return parsed.success ? [parsed.data] : []
  })
  const nested = parts.map(plainText).find(Boolean)

  if (nested) {
    return nested
  }

  const fallback = payload.mimeType === "text/html" && payload.body?.data ? Buffer.from(payload.body.data, "base64url").toString("utf8").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : ""

  return fallback
}

function summarize(item: z.infer<typeof message>) {
  const headers = item.payload?.headers

  return [`id: ${item.id}`, `threadId: ${item.threadId}`, `date: ${headerValue(headers, "Date")}`, `from: ${headerValue(headers, "From")}`, `subject: ${headerValue(headers, "Subject")}`, item.snippet ? `snippet: ${item.snippet}` : ""].filter(Boolean).join("\n")
}

function mime(details: { to: string; cc?: string; subject: string; body: string; inReplyTo?: string }) {
  const headers = [`To: ${details.to}`, details.cc ? `Cc: ${details.cc}` : "", `Subject: ${details.subject}`, details.inReplyTo ? `In-Reply-To: ${details.inReplyTo}` : "", details.inReplyTo ? `References: ${details.inReplyTo}` : "", "Content-Type: text/plain; charset=utf-8", "MIME-Version: 1.0"].filter(Boolean)

  return Buffer.from([...headers, "", details.body].join("\r\n")).toString("base64url")
}

export function createGmailAdapter(input: { observability: Observability; client?: GmailClient; endpoints?: GmailEndpoints }): PluginAdapter {
  const endpoints = input.endpoints ?? googleEndpoints
  const pending = new Map<string, () => void>()

  function client() {
    if (!input.client) {
      throw new Error("Gmail needs a Google client id. Set JOLT_GOOGLE_CLIENT_ID before starting Jolt.")
    }

    return input.client
  }

  async function call<T>(credentials: GmailCredentials, schema: z.ZodType<T>, path: string, init: RequestInit & { signal?: AbortSignal } = {}, retried = false): Promise<T> {
    const response = await fetch(`${endpoints.api}${path}`, { ...init, headers: { authorization: `Bearer ${credentials.accessToken}`, "content-type": "application/json", ...(init.headers ?? {}) } })
    const payload: unknown = await response.json().catch(() => ({}))

    if (response.status === 429 && !retried) {
      await Bun.sleep(rateLimitRetryDelayMs)

      return call(credentials, schema, path, init, true)
    }

    if (response.status === 401) {
      throw new PluginAuthError("Gmail rejected the access token")
    }

    if (!response.ok) {
      throw new Error(`Gmail answered ${response.status}: ${parse(schemas.failure, payload).error?.message ?? "unknown error"}`)
    }

    return parse(schema, payload)
  }

  async function fresh(account: PluginAccountSession) {
    const credentials = parseCredentials(account.secret)
    const expiresSoon = new Date(credentials.expiresAt).getTime() - Date.now() < 60_000

    if (!expiresSoon) {
      return credentials
    }

    const refreshed = await refreshCredentials(endpoints, client(), credentials)
    account.saveSecret(JSON.stringify(refreshed))

    return refreshed
  }

  async function withCredentials<T>(account: PluginAccountSession, operation: (credentials: GmailCredentials) => Promise<T>): Promise<T> {
    const credentials = await fresh(account)

    try {
      return await operation(credentials)
    } catch (error) {
      if (!(error instanceof PluginAuthError)) {
        throw error
      }

      const refreshed = await refreshCredentials(endpoints, client(), credentials)
      account.saveSecret(JSON.stringify(refreshed))

      return operation(refreshed)
    }
  }

  async function labels(credentials: GmailCredentials, signal?: AbortSignal) {
    const listed = await call(credentials, schemas.labelList, "/users/me/labels", { signal })

    return listed.labels ?? []
  }

  async function labelIds(credentials: GmailCredentials, names: string[], signal?: AbortSignal) {
    if (names.length === 0) {
      return []
    }

    const known = await labels(credentials, signal)

    return names.map((name) => {
      const found = known.find((label) => label.name.toLowerCase() === name.toLowerCase())

      if (!found) {
        throw new Error(`No Gmail label named "${name}". Available: ${known.map((label) => label.name).join(", ")}`)
      }

      return found.id
    })
  }

  async function threadLabels(credentials: GmailCredentials, threadId: string, signal?: AbortSignal) {
    const thread = await call(credentials, schemas.thread, `/users/me/threads/${threadId}?format=minimal`, { signal })
    const messages = thread.messages ?? []
    const everywhere = (id: string) => messages.every((item) => item.labelIds?.includes(id))
    const nowhere = (id: string) => messages.every((item) => !item.labelIds?.includes(id))
    const known = await labels(credentials, signal)
    const names = [...new Set(messages.flatMap((item) => item.labelIds ?? []))].map((id) => known.find((label) => label.id === id)?.name ?? id).sort()

    return { everywhere, nowhere, summary: `labels: ${names.join(", ") || "none"}` }
  }

  async function modifyThread(credentials: GmailCredentials, threadId: string, change: { add: string[]; remove: string[] }, signal?: AbortSignal) {
    await call(credentials, schemas.thread, `/users/me/threads/${threadId}/modify`, { method: "POST", body: JSON.stringify({ addLabelIds: change.add, removeLabelIds: change.remove }), signal })
    const verified = await threadLabels(credentials, threadId, signal)
    const applied = change.add.every(verified.everywhere) && change.remove.every(verified.nowhere)

    if (!applied) {
      throw new Error(`Gmail did not apply the label change to thread ${threadId}`)
    }

    return verified.summary
  }

  async function deliver(credentials: GmailCredentials, raw: string, threadId: string | undefined, signal?: AbortSignal) {
    const sent = await call(credentials, schemas.sent, "/users/me/messages/send", { method: "POST", body: JSON.stringify({ raw, ...(threadId ? { threadId } : {}) }), signal })
    const delivered = await call(credentials, schemas.message, `/users/me/messages/${sent.id}?format=metadata&metadataHeaders=To&metadataHeaders=Subject`, { signal })

    return `Message ${delivered.id} to ${headerValue(delivered.payload?.headers, "To")} with subject "${headerValue(delivered.payload?.headers, "Subject")}".`
  }

  const operations: Record<string, (credentials: GmailCredentials, params: Record<string, unknown>, signal?: AbortSignal) => Promise<string>> = {
    async gmail_search(credentials, params, signal) {
      const details = parse(inputs.gmail_search, params)
      const listed = await call(credentials, schemas.messageList, `/users/me/messages?${new URLSearchParams({ q: details.query, maxResults: String(details.limit) })}`, { signal })
      const found = listed.messages ?? []

      if (found.length === 0) {
        return "No messages match."
      }

      const messages: z.infer<typeof message>[] = []

      for (let start = 0; start < found.length; start += gmailSearchConcurrency) {
        const batch = found.slice(start, start + gmailSearchConcurrency)
        messages.push(...await Promise.all(batch.map((item) => call(credentials, schemas.message, `/users/me/messages/${item.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`, { signal }))))
      }

      return messages.map(summarize).join("\n\n")
    },
    async gmail_read_thread(credentials, params, signal) {
      const details = parse(inputs.gmail_read_thread, params)
      const thread = await call(credentials, schemas.thread, `/users/me/threads/${details.threadId}?format=full`, { signal })

      return (thread.messages ?? []).map((item) => `${summarize(item)}\nto: ${headerValue(item.payload?.headers, "To")}\n\n${plainText(item.payload) || "(no text body)"}`).join("\n\n---\n\n")
    },
    async gmail_create_draft(credentials, params, signal) {
      const details = parse(inputs.gmail_create_draft, params)
      const created = await call(credentials, schemas.draft, "/users/me/drafts", { method: "POST", body: JSON.stringify({ message: { raw: mime(details), ...(details.threadId ? { threadId: details.threadId } : {}) } }), signal })
      const verified = await call(credentials, schemas.draft, `/users/me/drafts/${created.id}`, { signal })

      return `Draft ${verified.id} saved in Gmail for ${details.to} with subject "${details.subject}". Use gmail_send_draft with draftId ${verified.id} to send it.`
    },
    async gmail_send_draft(credentials, params, signal) {
      const details = parse(inputs.gmail_send_draft, params)
      const sent = await call(credentials, schemas.draft, "/users/me/drafts/send", { method: "POST", body: JSON.stringify({ id: details.draftId }), signal })
      const messageId = sent.message?.id

      if (!messageId) {
        throw new Error("Gmail did not confirm the sent message")
      }

      const delivered = await call(credentials, schemas.message, `/users/me/messages/${messageId}?format=metadata&metadataHeaders=To&metadataHeaders=Subject`, { signal })

      return `Sent. Message ${delivered.id} to ${headerValue(delivered.payload?.headers, "To")} with subject "${headerValue(delivered.payload?.headers, "Subject")}".`
    },
    async gmail_send(credentials, params, signal) {
      const details = parse(inputs.gmail_send, params)

      return `Sent. ${await deliver(credentials, mime(details), undefined, signal)}`
    },
    async gmail_reply(credentials, params, signal) {
      const details = parse(inputs.gmail_reply, params)
      const thread = await call(credentials, schemas.thread, `/users/me/threads/${details.threadId}?format=metadata&metadataHeaders=From&metadataHeaders=Reply-To&metadataHeaders=Subject&metadataHeaders=Message-ID`, { signal })
      const latest = thread.messages?.at(-1)

      if (!latest) {
        throw new Error(`Thread ${details.threadId} has no messages`)
      }

      const headers = latest.payload?.headers
      const subject = headerValue(headers, "Subject")
      const to = headerValue(headers, "Reply-To") || headerValue(headers, "From")
      const raw = mime({ to, cc: details.cc, subject: /^re:/i.test(subject) ? subject : `Re: ${subject}`, body: details.body, inReplyTo: headerValue(headers, "Message-ID") })

      return `Replied in thread ${details.threadId}. ${await deliver(credentials, raw, details.threadId, signal)}`
    },
    async gmail_archive(credentials, params, signal) {
      const details = parse(inputs.gmail_thread, params)

      return `Thread ${details.threadId} archived. ${await modifyThread(credentials, details.threadId, { add: [], remove: ["INBOX"] }, signal)}`
    },
    async gmail_mark_read(credentials, params, signal) {
      const details = parse(inputs.gmail_mark_read, params)
      const change = details.read ? { add: [], remove: ["UNREAD"] } : { add: ["UNREAD"], remove: [] }

      return `Thread ${details.threadId} marked ${details.read ? "read" : "unread"}. ${await modifyThread(credentials, details.threadId, change, signal)}`
    },
    async gmail_label(credentials, params, signal) {
      const details = parse(inputs.gmail_label, params)
      const change = { add: await labelIds(credentials, details.add, signal), remove: await labelIds(credentials, details.remove, signal) }

      return `Thread ${details.threadId} updated. ${await modifyThread(credentials, details.threadId, change, signal)}`
    },
    async gmail_trash(credentials, params, signal) {
      const details = parse(inputs.gmail_thread, params)
      await call(credentials, schemas.thread, `/users/me/threads/${details.threadId}/trash`, { method: "POST", signal })
      const verified = await threadLabels(credentials, details.threadId, signal)

      if (!verified.everywhere("TRASH")) {
        throw new Error(`Gmail did not move thread ${details.threadId} to the trash`)
      }

      return `Thread ${details.threadId} moved to trash. ${verified.summary}`
    },
    async gmail_list_labels(credentials, _params, signal) {
      const known = await labels(credentials, signal)

      return known.map((label) => label.name).join("\n") || "No labels."
    },
  }

  return {
    kind: "gmail",
    availability() {
      return input.client ? { available: true } : { available: false, reason: "Gmail needs a Google client id. Set JOLT_GOOGLE_CLIENT_ID before starting Jolt." }
    },
    tools() {
      return gmailTools
    },
    connect(details) {
      const authorization = startAuthorization(endpoints, client())
      const key = crypto.randomUUID()
      pending.set(key, authorization.cancel)
      const connected = authorization.credentials.then(async (credentials) => {
        const profile = await call(credentials, schemas.profile, "/users/me/profile")
        input.observability.event({ name: "plugin.gmailconnected", context: { pluginId: details.pluginId } })

        return { label: profile.emailAddress, secret: JSON.stringify(credentials), tools: gmailTools }
      }).finally(() => {
        pending.delete(key)
      })

      details.step({ type: "browser", url: authorization.authorizationUrl })

      return { connected, cancel: authorization.cancel }
    },
    execute(account, tool, params, signal) {
      const operation = operations[tool.name]

      if (!operation) {
        throw new Error(`Unknown Gmail tool ${tool.name}`)
      }

      return withCredentials(account, (credentials) => operation(credentials, params, signal))
    },
    async stop() {},
  }
}
