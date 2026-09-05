import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { mkdir } from "node:fs/promises"
import { join } from "node:path"
import { createBots } from "@src/engine/bots/bots"
import { createConversations } from "@src/engine/conversations/conversations"
import { createErrorAutomation } from "@src/engine/error-automation/error-automation"
import { createObservationSystem } from "@src/engine/observability/observability"
import { openDatabase, type AppDatabase } from "@src/engine/persistence/database"
import { createPiAgentRuntime } from "@src/engine/pi/pi-agent-runtime"
import { createPiModels } from "@src/engine/pi/pi-models"
import { createPiProvider } from "@src/engine/pi/pi-provider"
import { createGmailAdapter } from "@src/engine/plugins/gmail/gmail"
import { createGithubAdapter } from "@src/engine/plugins/github/github"
import { createMcpAdapter } from "@src/engine/plugins/mcp/mcp"
import { createPlugins } from "@src/engine/plugins/plugins"
import { createSecrets } from "@src/engine/plugins/secrets"
import { createWhatsappAdapter } from "@src/engine/plugins/whatsapp/whatsapp"
import { createTasks } from "@src/engine/tasks/tasks"
import { errorAutomationSchemas, type ErrorDelivery } from "@src/shared/error-automation"
import { testDirectory } from "./support/test-directory"

const directory = testDirectory("jolt-error-automation-")

afterEach(() => mock.restore())

function diagnostic(): ErrorDelivery {
  return { id: "delivery-1", source: "dogama", environment: "production", errorId: "error-1", revision: "1", fingerprint: "checkout", type: "TypeError", title: "Checkout fails", severity: "error", count: "1", countDelta: "1", firstSeenAt: "2026-09-05T00:00:00Z", lastSeenAt: "2026-09-05T00:00:00Z", status: "pending", reopenedAt: null, codeVersion: "a".repeat(40), contexts: [{ id: "context-1", content: "Checkout stack", pruned: false }] }
}

function confirmed(database: AppDatabase) {
  const record = database.errorCases.ingest(diagnostic())
  const run = database.errorCases.claim(record.id, "analysis", 10, 1, 60_000)!
  database.errorCases.finish(run.id, { report: { caseId: record.id, revision: run.revision, codeVersion: "a".repeat(40), classification: "product_bug", observed: "Checkout fails before payment", expected: "Checkout completes", expectedSource: "Checkout contract", impact: "Users cannot pay", proof: { kind: "causal_chain", description: "Unhandled input reaches a throw" }, evidence: [{ path: "src/checkout.ts", line: 12, quote: "throw new Error()", explanation: "Invalid input is not handled" }], gaps: [], internalFixHypothesis: "PRIVATE PATCH HYPOTHESIS" } })

  return database.errorCases.decide({ caseId: record.id, revision: run.revision, verdict: "confirmed", reason: "Source proves the causal chain" })
}

async function openOperation() {
  const { observability } = createObservationSystem({ appSessionId: "test-automation", logDirectory: join(directory, "logs"), development: false, outputs: [] })
  const databasePath = join(directory, "jolt.sqlite")
  const database = openDatabase(databasePath, observability)
  const secrets = createSecrets("11".repeat(32))
  const runtime = createPiAgentRuntime({ async open() { throw new Error("These coordination scenarios must not start an LLM") } }, observability)
  const bots = createBots({ database, observability, privateBotsDirectory: join(directory, "bots"), providers: createPiProvider(observability, createPiModels()), conversations: { close: (botId) => conversations.close(botId), isActive: (botId) => !!conversations.active(botId) } })
  const tasks = createTasks({ database, observability })
  const conversations = createConversations({ database, bots, tasks, runtime, observability, extensions: [] })
  const github = createGithubAdapter({ relayUrl: "https://relay.example.com", observability, event() {} })
  const plugins = createPlugins({ database, bots, observability, secrets, conversations, adapters: { github, gmail: createGmailAdapter({ observability }), mcp: createMcpAdapter({ observability }), whatsapp: createWhatsappAdapter({ observability, database }) } })
  const rootDirectory = join(directory, "error-automation")
  await mkdir(rootDirectory, { recursive: true })
  database.projects.create({ id: "dogama-project", name: "Dogama", defaultWorkingDirectory: directory, createdAt: new Date().toISOString() })

  for (const id of ["dogama", "analysis-leader", "correction-leader"]) {
    database.bots.create({ id, avatarSeed: id, leaderBotId: null, projectId: "dogama-project", name: id, provider: "codex", function: { outcome: "Handle Dogama errors" }, workingDirectoryOverride: rootDirectory, temporary: false, memoryEnabled: false, effort: "max", model: "gpt-5.6-sol", permissionMode: "full", executionProfile: "error-leader", createdAt: new Date().toISOString() })
  }

  database.accounts.create({ id: "github-account", pluginId: "github", label: "Dogama GitHub", state: "connected", secret: secrets.seal(JSON.stringify({ installationId: "1", relayToken: "test-relay-token", relayUrl: "https://relay.example.com" })), tools: [], checkedAt: new Date().toISOString() })
  database.accesses.set({ botId: "analysis-leader", accountId: "github-account" })
  database.accesses.set({ botId: "correction-leader", accountId: "github-account" })
  const config = errorAutomationSchemas.config.parse({ projectId: "dogama-project", dogamaBotId: "dogama", sourceUrl: "https://diagnostics.example.com", repositoryDirectory: directory, githubAccountId: "github-account", collect: false, analyze: false, publish: false, correct: false, analysisLeaderId: "analysis-leader", correctionLeaderId: "correction-leader" })
  database.errorCases.configure(config, secrets.seal("diagnostic-service-test-token"))
  const createOperation = () => createErrorAutomation({ database, bots, conversations, tasks, runtime, plugins, secrets, rootDirectory, observability })
  const operation = createOperation()

  return { database, databasePath, config, operation, createOperation, plugins, conversations, observability, bots }
}

async function withOperation(check: (context: Awaited<ReturnType<typeof openOperation>>) => Promise<void>) {
  const context = await openOperation()

  try {
    await check(context)
  } finally {
    await context.operation.dispose()
    await context.plugins.dispose()
    context.conversations.dispose()
    context.database.close()
    await context.observability.flush()
  }
}

function intercept(respond: (url: URL, init?: RequestInit) => Response | Promise<Response>) {
  const requests: { url: URL; method: string }[] = []
  spyOn(globalThis, "fetch").mockImplementation(Object.assign(async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    requests.push({ url, method: init?.method ?? "GET" })

    if (url.hostname === "relay.example.com") {
      return Response.json({ token: "test-installation-token", expiresAt: "2099-01-01T00:00:00Z" })
    }

    if (url.hostname === "api.github.com" && url.pathname.endsWith("/labels")) {
      return Response.json(["bug", "dogama-errors", "triage:confirmed", "automation:fix"].map((name) => ({ name })))
    }

    return await respond(url, init)
  }, { preconnect: fetch.preconnect }))

  return requests
}

function remoteIssue(fields: { title: string; body: string; labels: string[] }) {
  return { number: 42, title: fields.title, body: fields.body, labels: fields.labels.map((name) => ({ name })), state: "open", html_url: "https://github.com/dogama-erp/app/issues/42", user: { login: "jolt" }, created_at: "2026-09-05T00:00:00Z", updated_at: "2026-09-05T00:00:00Z" }
}

test.each([false, true])("new issues require human correction release unless explicitly enabled: %s", async (releaseCorrections) => {
  await withOperation(async ({ database, config, operation }) => {
    const record = confirmed(database)
    database.errorCases.configure({ ...config, publish: true, releaseCorrections })
    const remote: { issue?: ReturnType<typeof remoteIssue> } = {}
    intercept((url, init) => {
      if (init?.method === "POST") {
        remote.issue = remoteIssue(JSON.parse(String(init.body)))
        return Response.json(remote.issue)
      }
      return Response.json(url.pathname.endsWith("/issues") ? [] : remote.issue)
    })
    await operation.run()
    expect(database.errorCases.get(record.id)?.state).toBe("issue_open")
    expect(remote.issue!.labels.some((label) => label.name === "automation:fix")).toBe(releaseCorrections)
  })
})

test("a Leader cannot mutate cases outside its reserved review", async () => {
  await withOperation(async ({ database, operation, bots }) => {
    const record = confirmed(database)
    const leader = bots.get({ id: "analysis-leader" })!
    const tools = operation.tools(leader)
    await expect(tools.find((tool) => tool.name === "error_case_reanalyze")!.execute({ caseId: record.id })).rejects.toThrow("currently reserved review")
    expect(database.errorCases.get(record.id)?.state).toBe("confirmed")
  })
})

test("collection commits before acknowledging and retries a failed ACK without duplicating the case", async () => {
  await withOperation(async ({ database, databasePath, config, operation, observability }) => {
    database.errorCases.configure({ ...config, collect: true })
    const acknowledgements: string[][] = []
    intercept((url, init) => {
      expect(url.hostname).toBe("diagnostics.example.com")

      if (url.pathname === "/api/error-deliveries") {
        return Response.json({ deliveries: [diagnostic()] })
      }

      expect(url.pathname).toBe("/api/error-deliveries/ack")
      const persisted = openDatabase(databasePath, observability)

      try {
        expect(persisted.errorCases.list()).toHaveLength(1)
        expect(persisted.errorCases.pendingAcks()).toHaveLength(1)
      } finally {
        persisted.close()
      }

      acknowledgements.push(JSON.parse(String(init?.body)).ids)

      if (acknowledgements.length === 1) {
        return Response.json({ error: "Unavailable" }, { status: 503 })
      }

      return Response.json({ acknowledged: ["delivery-1"] })
    })
    await operation.run()
    expect(database.errorCases.pendingAcks()).toHaveLength(1)
    await operation.run()
    expect(acknowledgements).toEqual([["delivery-1"], ["delivery-1"]])
    expect(database.errorCases.pendingAcks()).toEqual([])
    expect(database.errorCases.list()).toHaveLength(1)
    expect(operation.status().failure).toBeNull()
  })
})

test("a confirmed report with publication paused produces a draft without contacting GitHub", async () => {
  await withOperation(async ({ database, operation }) => {
    const record = confirmed(database)
    const requests = intercept(() => { throw new Error("No external request expected") })
    await operation.run()
    const current = database.errorCases.get(record.id)!
    expect(current).toMatchObject({ state: "confirmed", issueState: "none" })
    expect(current.issueDraft).toContain(`<!-- jolt-dogama-error:${record.id} -->`)
    expect(current.issueDraft).toContain("Checkout fails before payment")
    expect(current.issueDraft).not.toContain("PRIVATE PATCH HYPOTHESIS")
    expect(requests).toEqual([])
  })
})

test("an accepted creation with a lost response waits through an empty listing and then reconciles by its durable marker", async () => {
  await withOperation(async ({ database, config, operation }) => {
    const record = confirmed(database)
    database.errorCases.configure({ ...config, publish: true })
    const remote: { issue?: ReturnType<typeof remoteIssue>; visible: boolean } = { visible: false }
    const requests = intercept((url, init) => {
      expect(url.hostname).toBe("api.github.com")

      if (init?.method === "POST") {
        remote.issue = remoteIssue(JSON.parse(String(init.body)))
        throw new Error("Connection closed after GitHub accepted the write")
      }

      if (url.pathname.endsWith("/issues")) {
        expect(url.searchParams.get("state")).toBe("all")

        return Response.json(remote.visible ? [remote.issue] : [])
      }

      expect(url.pathname).toBe("/repos/dogama-erp/app/issues/42")

      if (init?.method === "PATCH") {
        const fields = JSON.parse(String(init.body))
        Object.assign(remote.issue!, fields, { labels: fields.labels.map((name: string) => ({ name })) })
      }

      return Response.json(remote.issue)
    })
    await operation.run()
    expect(database.errorCases.get(record.id)?.issueState).toBe("unknown")
    await operation.run()
    expect(database.errorCases.get(record.id)?.issueState).toBe("unknown")
    expect(requests.filter((request) => request.url.hostname === "api.github.com" && request.method === "POST")).toHaveLength(1)
    remote.visible = true
    await operation.run()
    expect(database.errorCases.get(record.id)).toMatchObject({ state: "issue_open", issueState: "published", issueNumber: 42, issueUrl: "https://github.com/dogama-erp/app/issues/42", failure: null })
    expect(requests.filter((request) => request.url.hostname === "api.github.com" && request.method === "POST")).toHaveLength(1)
  })
})

test("pausing publication during the awaited issue lookup prevents creation", async () => {
  await withOperation(async ({ database, config, operation }) => {
    const record = confirmed(database)
    database.errorCases.configure({ ...config, publish: true })
    const lookup = Promise.withResolvers<Response>()
    const started = Promise.withResolvers<void>()
    const requests = intercept((url) => {
      expect(url.pathname).toBe("/repos/dogama-erp/app/issues")
      started.resolve()

      return lookup.promise
    })
    const running = operation.run()
    await started.promise
    database.errorCases.configure({ ...config, publish: false })
    lookup.resolve(Response.json([]))
    await running
    expect(database.errorCases.get(record.id)?.issueState).toBe("none")
    expect(requests.filter((request) => request.url.hostname === "api.github.com" && request.method === "POST")).toEqual([])
  })
})

test.each([false, true])("reanalyzing during issue lookup preserves the queue and prevents publication (existing issue: %s)", async (existing) => {
  await withOperation(async ({ database, config, operation }) => {
    const record = confirmed(database)
    database.errorCases.configure({ ...config, publish: true })
    const lookup = Promise.withResolvers<Response>()
    const started = Promise.withResolvers<void>()
    const requests = intercept((url) => {
      expect(url.pathname).toBe("/repos/dogama-erp/app/issues")
      started.resolve()

      return lookup.promise
    })
    const running = operation.run()
    await started.promise
    operation.reanalyze({ caseId: record.id })
    lookup.resolve(Response.json(existing ? [remoteIssue({ title: "Existing issue", body: `<!-- jolt-dogama-error:${record.id} -->`, labels: ["bug"] })] : []))
    await running
    expect(database.errorCases.get(record.id)).toMatchObject({ state: "queued", issueState: "none", issueNumber: null })
    expect(requests.filter((request) => request.url.hostname === "api.github.com" && request.method !== "GET")).toEqual([])
  })
})

test.each([["creating", "fixing"], ["unknown", "fixing"], ["creating", "fix_failed"], ["unknown", "fix_failed"]] as const)("restart reconciles a %s PR from %s without recreating it when listing is initially empty", async (prState, initialState) => {
  await withOperation(async ({ database, config, operation, createOperation }) => {
    const record = confirmed(database)
    const branch = `jolt/error-42-${record.contextHash.slice(0, 12)}`
    database.errorCases.update(record.id, { state: initialState, issueState: "published", issueNumber: 42, branch, prState })
    database.errorCases.configure({ ...config, correct: true })
    const remote = { visible: false }
    const pull = { number: 7, title: "Correct checkout", body: `<!-- jolt-dogama-error:${record.id} -->`, state: "open", draft: true, html_url: "https://github.com/dogama-erp/app/pull/7", user: { login: "jolt" }, head: { ref: branch, sha: "b".repeat(40) }, base: { ref: "dev" }, created_at: "2026-09-05T00:00:00Z", updated_at: "2026-09-05T00:00:00Z", merged_at: null }
    const requests = intercept((url, init) => {
      expect(init?.method ?? "GET").toBe("GET")

      if (url.pathname.endsWith("/pulls")) {
        expect(url.searchParams.get("state")).toBe("all")
        expect(url.searchParams.get("head")).toBe(`dogama-erp:${branch}`)

        return Response.json(remote.visible ? [pull] : [])
      }

      if (url.pathname.endsWith("/files")) {
        return Response.json([])
      }

      if (url.pathname.endsWith("/check-runs")) {
        return Response.json({ check_runs: [] })
      }

      expect(url.pathname).toBe("/repos/dogama-erp/app/pulls/7")

      return Response.json(pull)
    })
    await operation.run()
    await operation.dispose()
    expect(database.errorCases.get(record.id)).toMatchObject({ state: initialState, branch, prNumber: null })
    expect(["creating", "unknown"]).toContain(database.errorCases.get(record.id)!.prState)
    expect(database.errorCases.attempts(record.id, "correction")).toBe(0)
    remote.visible = true
    const resumed = createOperation()

    try {
      await resumed.run()
    } finally {
      await resumed.dispose()
    }

    expect(database.errorCases.get(record.id)).toMatchObject({ state: "pr_open", prState: "published", prNumber: 7, prUrl: pull.html_url, failure: null })
    expect(requests.filter((request) => request.url.hostname === "api.github.com" && request.method !== "GET")).toEqual([])
  })
})
