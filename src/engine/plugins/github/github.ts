import { z } from "zod"
import type { ExternalEvent } from "@src/shared/triggers"
import { githubSchemas, type GithubCredentials } from "@src/shared/github"
import { parse } from "@src/shared/parse"
import type { ToolDescriptor } from "@src/shared/plugins"
import type { Observability } from "@src/engine/observability/observability"
import { PluginAuthError, type PluginAccountSession, type PluginAdapter } from "../plugin-adapter"

const pollDelayMs = 2_000
const retryDelayMs = 3_000
const githubApiVersion = "2026-03-10"
const repositoryInput = { owner: z.string().min(1), repository: z.string().min(1) }
const issueInput = z.strictObject({ ...repositoryInput, number: z.coerce.number().int().positive() })
const pullRequestInput = issueInput
const commentInput = issueInput.extend({ body: z.string().min(1) })
const createPullRequestInput = z.strictObject({ ...repositoryInput, title: z.string().min(1), body: z.string(), head: z.string().min(1), base: z.string().min(1), draft: z.boolean().default(true) })
const user = z.looseObject({ login: z.string().min(1) })
const label = z.looseObject({ name: z.string().min(1) })
const issue = z.looseObject({ number: z.int(), title: z.string(), body: z.string().nullable(), state: z.string(), html_url: z.url(), user, labels: z.array(label), created_at: z.string(), updated_at: z.string() })
const pullRequest = z.looseObject({ number: z.int(), title: z.string(), body: z.string().nullable(), state: z.string(), draft: z.boolean(), html_url: z.url(), user, head: z.looseObject({ ref: z.string(), sha: z.string() }), base: z.looseObject({ ref: z.string() }), created_at: z.string(), updated_at: z.string() })
const pullRequestFile = z.looseObject({ filename: z.string(), status: z.string(), additions: z.int(), deletions: z.int(), patch: z.string().optional() })
const pullRequestFiles = z.array(pullRequestFile)
const checkRun = z.looseObject({ name: z.string(), status: z.string(), conclusion: z.string().nullable(), html_url: z.url().nullable() })
const checkRuns = z.looseObject({ check_runs: z.array(checkRun) }).transform((value) => value.check_runs)
const createdPullRequest = pullRequest
const createdComment = z.looseObject({ html_url: z.url() })

const githubTools: ToolDescriptor[] = [
  {
    name: "github_repositories",
    label: "Repositórios do GitHub",
    description: "List the repositories available through the chosen GitHub Conta. Use the ids from this result when creating a Gatilho.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "github_issue_read",
    label: "Leitura de issue do GitHub",
    description: "Read the current state of one GitHub issue. Use this after a GitHub Evento because the webhook payload may be old.",
    inputSchema: { type: "object", properties: { owner: { type: "string" }, repository: { type: "string" }, number: { type: "number" } }, required: ["owner", "repository", "number"] },
  },
  {
    name: "github_pull_request_read",
    label: "Leitura de PR do GitHub",
    description: "Read the current pull request, its changed files and checks.",
    inputSchema: { type: "object", properties: { owner: { type: "string" }, repository: { type: "string" }, number: { type: "number" } }, required: ["owner", "repository", "number"] },
  },
  {
    name: "github_comment",
    label: "Comentário no GitHub",
    description: "Publish one comment on a GitHub issue or pull request.",
    inputSchema: { type: "object", properties: { owner: { type: "string" }, repository: { type: "string" }, number: { type: "number" }, body: { type: "string" } }, required: ["owner", "repository", "number", "body"] },
  },
  {
    name: "github_pull_request_create",
    label: "Criação de PR no GitHub",
    description: "Open a GitHub pull request from a branch that has already been pushed. Create it as a draft unless the person explicitly requested otherwise.",
    inputSchema: { type: "object", properties: { owner: { type: "string" }, repository: { type: "string" }, title: { type: "string" }, body: { type: "string" }, head: { type: "string" }, base: { type: "string" }, draft: { type: "boolean" } }, required: ["owner", "repository", "title", "body", "head", "base"] },
  },
]

function decodeCredentials(secret: string) {
  return parse(githubSchemas.credentials, JSON.parse(secret))
}

async function relayJson<Schema extends z.ZodType>(schema: Schema, url: URL, init?: RequestInit): Promise<z.output<Schema>> {
  const response = await fetch(url, init)
  const body: unknown = await response.json().catch(() => undefined)

  if (response.status === 401 || response.status === 403) {
    throw new PluginAuthError("GitHub needs to authenticate again")
  }

  if (!response.ok) {
    throw new Error(`GitHub relay returned ${response.status}`)
  }

  return parse(schema, body)
}

export function createGithubAdapter(input: { relayUrl?: string; observability: Observability; event(accountId: string, event: ExternalEvent): void }): PluginAdapter {
  const sessions = new Map<string, AbortController>()
  const tokens = new Map<string, { token: string; expiresAt: number }>()

  function configuredRelay() {
    if (!input.relayUrl) {
      throw new Error("GitHub relay is not configured")
    }

    return new URL(input.relayUrl)
  }

  async function tokenFor(account: PluginAccountSession) {
    const cached = tokens.get(account.id)

    if (cached && cached.expiresAt > Date.now() + 60_000) {
      return cached.token
    }

    const credentials = decodeCredentials(account.secret)
    const url = new URL(`/v1/installations/${encodeURIComponent(credentials.installationId)}/token`, credentials.relayUrl)
    const issued = await relayJson(githubSchemas.installationToken, url, { method: "POST", headers: { authorization: `Bearer ${credentials.relayToken}` } })
    tokens.set(account.id, { token: issued.token, expiresAt: Date.parse(issued.expiresAt) })

    return issued.token
  }

  async function githubJson<Schema extends z.ZodType>(account: PluginAccountSession, schema: Schema, path: string, init?: RequestInit): Promise<z.output<Schema>> {
    const token = await tokenFor(account)
    const headers = new Headers(init?.headers)
    headers.set("accept", "application/vnd.github+json")
    headers.set("authorization", `Bearer ${token}`)
    headers.set("content-type", "application/json")
    headers.set("user-agent", "Jolt")
    headers.set("x-github-api-version", githubApiVersion)
    const response = await fetch(new URL(path, "https://api.github.com"), {
      ...init,
      headers,
    })
    const body: unknown = await response.json().catch(() => undefined)

    if (response.status === 401 || response.status === 403) {
      tokens.delete(account.id)
      throw new PluginAuthError("GitHub rejected this Conta")
    }

    if (!response.ok) {
      throw new Error(`GitHub returned ${response.status}`)
    }

    return parse(schema, body)
  }

  async function githubPages<Item>(account: PluginAccountSession, schema: z.ZodType<Item[]>, path: string) {
    const values: Item[] = []
    let page = 1

    while (true) {
      const url = new URL(path, "https://api.github.com")
      url.searchParams.set("per_page", "100")
      url.searchParams.set("page", String(page))
      const current = await githubJson(account, schema, `${url.pathname}${url.search}`)
      values.push(...current)

      if (current.length < 100) {
        return values
      }

      page += 1
    }
  }

  async function poll(account: PluginAccountSession, signal: AbortSignal) {
    let credentials = decodeCredentials(account.secret)

    while (!signal.aborted) {
      try {
        const url = new URL(`/v1/installations/${encodeURIComponent(credentials.installationId)}/events`, credentials.relayUrl)

        if (credentials.cursor) {
          url.searchParams.set("cursor", credentials.cursor)
        }

        const batch = await relayJson(githubSchemas.eventBatch, url, { headers: { authorization: `Bearer ${credentials.relayToken}` }, signal })

        for (const event of batch.events) {
          input.event(account.id, event)
        }

        if (batch.cursor !== credentials.cursor) {
          credentials = { ...credentials, cursor: batch.cursor }
          account.saveSecret(JSON.stringify(credentials))
        }

        if (batch.events.length === 0) {
          await Bun.sleep(pollDelayMs)
        }
      } catch (error) {
        if (signal.aborted) {
          return
        }

        input.observability.event({ name: "plugin.githubpollfailed", context: { pluginId: account.pluginId }, error: error instanceof Error ? error : new Error("GitHub polling failed") })
        await Bun.sleep(retryDelayMs)
      }
    }
  }

  function resume(account: PluginAccountSession) {
    sessions.get(account.id)?.abort()
    const controller = new AbortController()
    sessions.set(account.id, controller)
    void poll(account, controller.signal)
  }

  const operations: Record<string, (account: PluginAccountSession, raw: Record<string, unknown>) => Promise<string>> = {
    async github_repositories(account) {
      const repositories = await githubPages(account, githubSchemas.repositories, "/installation/repositories")

      return JSON.stringify(repositories)
    },
    async github_issue_read(account, raw) {
      const details = parse(issueInput, raw)
      const current = await githubJson(account, issue, `/repos/${encodeURIComponent(details.owner)}/${encodeURIComponent(details.repository)}/issues/${details.number}`)

      return JSON.stringify(current)
    },
    async github_pull_request_read(account, raw) {
      const details = parse(pullRequestInput, raw)
      const path = `/repos/${encodeURIComponent(details.owner)}/${encodeURIComponent(details.repository)}/pulls/${details.number}`
      const current = await githubJson(account, pullRequest, path)
      const [files, checks] = await Promise.all([
        githubPages(account, pullRequestFiles, `${path}/files`),
        githubPages(account, checkRuns, `/repos/${encodeURIComponent(details.owner)}/${encodeURIComponent(details.repository)}/commits/${encodeURIComponent(current.head.sha)}/check-runs`),
      ])

      return JSON.stringify({ ...current, files, checks })
    },
    async github_comment(account, raw) {
      const details = parse(commentInput, raw)
      const created = await githubJson(account, createdComment, `/repos/${encodeURIComponent(details.owner)}/${encodeURIComponent(details.repository)}/issues/${details.number}/comments`, { method: "POST", body: JSON.stringify({ body: details.body }) })

      return `Comment published: ${created.html_url}`
    },
    async github_pull_request_create(account, raw) {
      const details = parse(createPullRequestInput, raw)
      const created = await githubJson(account, createdPullRequest, `/repos/${encodeURIComponent(details.owner)}/${encodeURIComponent(details.repository)}/pulls`, { method: "POST", body: JSON.stringify({ title: details.title, body: details.body, head: details.head, base: details.base, draft: details.draft }) })

      return `Pull request #${created.number} opened${created.draft ? " as a draft" : ""}: ${created.html_url}`
    },
  }

  return {
    kind: "github",
    availability() {
      if (!input.relayUrl) {
        return { available: false, reason: "O relay do GitHub não está configurado" }
      }

      return { available: true }
    },
    tools() {
      return githubTools
    },
    connect(details) {
      const controller = new AbortController()
      const connected = (async () => {
        const relay = configuredRelay()
        const started = await relayJson(githubSchemas.connectionStarted, new URL("/v1/connections", relay), { method: "POST", signal: controller.signal })
        details.step({ type: "browser", url: started.installUrl })

        while (!controller.signal.aborted) {
          const status = await relayJson(githubSchemas.connectionStatus, new URL(`/v1/connections/${encodeURIComponent(started.connectionId)}`, relay), { headers: { authorization: `Bearer ${started.connectionToken}` }, signal: controller.signal })

          if (status.status === "connected") {
            const secret: GithubCredentials = { installationId: status.installationId, relayToken: status.relayToken, relayUrl: relay.toString() }

            return { label: status.accountLogin, secret: JSON.stringify(secret), tools: githubTools }
          }

          await Bun.sleep(pollDelayMs)
        }

        throw new Error("Connection cancelled")
      })()

      return { connected, cancel: () => controller.abort() }
    },
    resume,
    async execute(account, tool, raw) {
      const operation = operations[tool.name]

      if (!operation) {
        throw new Error(`Unknown GitHub tool ${tool.name}`)
      }

      return operation(account, raw)
    },
    async stop(accountId) {
      sessions.get(accountId)?.abort()
      sessions.delete(accountId)
      tokens.delete(accountId)
    },
  }
}
