import { createHmac, createPrivateKey, sign, timingSafeEqual } from "node:crypto"
import { z } from "zod"
import { parse } from "@src/shared/parse"
import { triggerSchemas } from "@src/shared/triggers"

const githubApiVersion = "2026-03-10"
const id = z.union([z.int(), z.string().min(1)]).transform(String)
const installation = z.looseObject({ id, account: z.looseObject({ login: z.string().min(1) }), suspended_at: z.string().nullable() })
const installationToken = z.looseObject({ token: z.string().min(1), expires_at: z.string().min(1) }).transform((value) => ({ token: value.token, expiresAt: value.expires_at }))
const label = z.union([z.string().min(1), z.looseObject({ name: z.string().min(1) })]).transform((value) => typeof value === "string" ? value : value.name)
const subject = z.looseObject({
  id,
  number: z.int().positive().optional(),
  title: z.string().optional(),
  name: z.string().optional(),
  body: z.string().nullable().optional(),
  html_url: z.url().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  started_at: z.string().optional(),
  completed_at: z.string().optional(),
  labels: z.array(label).optional(),
  pull_request: z.unknown().optional(),
})
const webhook = z.looseObject({
  action: z.string().min(1),
  installation: z.looseObject({ id }),
  repository: z.looseObject({ id, full_name: z.string().min(1) }),
  sender: z.looseObject({ login: z.string().min(1), type: z.string().min(1) }),
  issue: subject.optional(),
  pull_request: subject.optional(),
  review: subject.optional(),
  comment: subject.optional(),
  check_run: subject.optional(),
})

const supportedEvents = new Set(["issues", "issue_comment", "pull_request", "pull_request_review", "pull_request_review_comment", "check_run"])

function encode(value: object) {
  return Buffer.from(JSON.stringify(value)).toString("base64url")
}

function eventSubject(event: string, payload: z.output<typeof webhook>) {
  if (event === "issues" || event === "issue_comment") {
    return payload.issue
  }

  if (event === "pull_request" || event === "pull_request_review" || event === "pull_request_review_comment") {
    return payload.pull_request
  }

  return payload.check_run
}

function eventActivity(event: string, payload: z.output<typeof webhook>) {
  if (event === "issue_comment" || event === "pull_request_review_comment") {
    return payload.comment
  }

  if (event === "pull_request_review") {
    return payload.review
  }

  return eventSubject(event, payload)
}

export function createGithubApp(input: { appId: string; appSlug: string; privateKey: string; webhookSecret: string }) {
  const privateKey = createPrivateKey(input.privateKey.replaceAll("\\n", "\n"))

  function jwt() {
    const now = Math.floor(Date.now() / 1000)
    const header = encode({ alg: "RS256", typ: "JWT" })
    const payload = encode({ iat: now - 60, exp: now + 9 * 60, iss: input.appId })
    const content = `${header}.${payload}`
    const signature = sign("RSA-SHA256", Buffer.from(content), privateKey).toString("base64url")

    return `${content}.${signature}`
  }

  async function appJson<Schema extends z.ZodType>(schema: Schema, path: string, init?: RequestInit): Promise<z.output<Schema>> {
    const response = await fetch(new URL(path, "https://api.github.com"), {
      ...init,
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${jwt()}`,
        "content-type": "application/json",
        "user-agent": "Jolt GitHub Relay",
        "x-github-api-version": githubApiVersion,
      },
    })
    const body: unknown = await response.json().catch(() => undefined)

    if (!response.ok) {
      throw new Error(`GitHub returned ${response.status}`)
    }

    return parse(schema, body)
  }

  return {
    installUrl(state: string) {
      const url = new URL(`https://github.com/apps/${encodeURIComponent(input.appSlug)}/installations/new`)
      url.searchParams.set("state", state)

      return url.toString()
    },
    async installation(installationId: string) {
      const current = await appJson(installation, `/app/installations/${encodeURIComponent(installationId)}`)

      if (current.suspended_at) {
        throw new Error("The GitHub installation is suspended")
      }

      return { id: current.id, accountLogin: current.account.login }
    },
    token(installationId: string) {
      return appJson(installationToken, `/app/installations/${encodeURIComponent(installationId)}/access_tokens`, { method: "POST", body: "{}" })
    },
    verify(body: string, signature: string | null) {
      if (!signature?.startsWith("sha256=")) {
        return false
      }

      const expected = Buffer.from(`sha256=${createHmac("sha256", input.webhookSecret).update(body).digest("hex")}`)
      const received = Buffer.from(signature)

      return expected.length === received.length && timingSafeEqual(expected, received)
    },
    event(deliveryId: string, event: string | null, body: string) {
      if (!event || !supportedEvents.has(event)) {
        return
      }

      const payload = parse(webhook, JSON.parse(body))
      const candidate = eventSubject(event, payload)
      const activity = eventActivity(event, payload)

      if (!candidate || !activity) {
        throw new Error(`GitHub ${event} payload is incomplete`)
      }

      const title = [candidate.title, candidate.name].find((value) => value?.trim())
      const occurredAt = [candidate.updated_at, candidate.created_at, candidate.completed_at, candidate.started_at].find(Boolean) ?? new Date().toISOString()
      const kind = event === "issue_comment" && candidate.pull_request ? "pull_request" : event
      const content = [
        `${event}.${payload.action} in ${payload.repository.full_name}`,
        candidate.number ? `#${candidate.number}${title ? `: ${title}` : ""}` : title,
        activity.body,
        activity.html_url,
      ].filter(Boolean).join("\n")

      return parse(triggerSchemas.externalEvent, {
        deliveryId,
        installationId: payload.installation.id,
        source: "github",
        event,
        action: payload.action,
        repository: { id: payload.repository.id, fullName: payload.repository.full_name },
        labels: candidate.labels ?? [],
        sender: payload.sender,
        subject: { id: candidate.id, kind, ...(candidate.number ? { number: candidate.number } : {}), ...(title ? { title } : {}), ...(candidate.html_url ? { url: candidate.html_url } : {}) },
        content,
        occurredAt,
        ownEvent: payload.sender.login === `${input.appSlug}[bot]`,
      })
    },
  }
}

export type GithubApp = ReturnType<typeof createGithubApp>
