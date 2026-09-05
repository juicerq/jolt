import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { createGithubAdapter } from "@src/engine/plugins/github/github"
import { createObservationSystem } from "@src/engine/observability/observability"

afterEach(() => mock.restore())

function issue(number: number) {
  return { number, title: "Checkout failure", body: "<!-- dogama:error:123 -->", state: "open", html_url: `https://github.com/dogama/app/issues/${number}`, user: { login: "jolt" }, labels: [{ name: "bug" }], created_at: "2026-09-05T00:00:00Z", updated_at: "2026-09-05T00:00:00Z" }
}

function setup(respond: (url: URL, init?: RequestInit) => Response | Promise<Response>) {
  const requests: { url: URL; init?: RequestInit }[] = []
  spyOn(globalThis, "fetch").mockImplementation(Object.assign(async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = new URL(input instanceof Request ? input.url : String(input))

    if (url.hostname === "relay.example.com") {
      return Response.json({ token: "test-token", expiresAt: "2099-01-01T00:00:00Z" })
    }

    requests.push({ url, ...(init ? { init } : {}) })

    return await respond(url, init)
  }, { preconnect: fetch.preconnect }))
  const { observability } = createObservationSystem({ appSessionId: "github-issues-test", logDirectory: "/unused", development: false, outputs: [] })
  const adapter = createGithubAdapter({ observability, event() {} })
  const account = { id: "test-account", pluginId: "github", label: "Dogama", secret: JSON.stringify({ installationId: "1", relayToken: "test-relay-token", relayUrl: "https://relay.example.com" }), saveSecret() {} }

  return {
    requests,
    async execute(name: string, input: Record<string, unknown>) {
      const tool = adapter.tools?.().find((value) => value.name === name)

      if (!tool) {
        throw new Error(`Missing tool ${name}`)
      }

      return await adapter.execute(account, tool, { owner: "dogama", repository: "app", ...input })
    },
  }
}

test("issue reconciliation includes closed issues across full pages and excludes pull requests", async () => {
  const api = setup((url) => {
    expect(url.pathname).toBe("/repos/dogama/app/issues")
    expect(url.searchParams.get("state")).toBe("all")
    expect(url.searchParams.get("labels")).toBe("bug,needs triage")
    expect(url.searchParams.get("per_page")).toBe("100")

    if (url.searchParams.get("page") === "1") {
      return Response.json(Array.from({ length: 100 }, (_, index) => ({ ...issue(index + 1), pull_request: { url: `https://api.github.com/repos/dogama/app/pulls/${index + 1}` } })))
    }

    return Response.json([{ ...issue(101), state: "closed" }])
  })
  const result = JSON.parse(await api.execute("github_issues_list", { state: "all", labels: ["bug", "needs triage"] }))

  expect(result).toEqual([{ number: 101, title: "Checkout failure", body: "<!-- dogama:error:123 -->", state: "closed", url: "https://github.com/dogama/app/issues/101", labels: ["bug"] }])
  expect(api.requests).toHaveLength(2)
})

test("issue creation returns confirmed data after a separate read", async () => {
  const api = setup((url, init) => {
    if (init?.method === "POST") {
      expect(url.pathname).toBe("/repos/dogama/app/issues")
      expect(JSON.parse(String(init.body))).toEqual({ title: "Checkout failure", body: "<!-- dogama:error:123 -->", labels: ["bug"] })

      return Response.json(issue(42), { status: 201 })
    }

    expect(url.pathname).toBe("/repos/dogama/app/issues/42")

    return Response.json({ ...issue(42), labels: [{ name: "Bug" }] })
  })
  const result = JSON.parse(await api.execute("github_issue_create", { title: "Checkout failure", body: "<!-- dogama:error:123 -->", labels: ["bug"] }))

  expect(result).toEqual({ number: 42, title: "Checkout failure", body: "<!-- dogama:error:123 -->", state: "open", url: "https://github.com/dogama/app/issues/42", labels: ["Bug"] })
  expect(api.requests).toHaveLength(2)
})

test("issue update replaces labels and verifies the new state", async () => {
  const api = setup((url, init) => {
    expect(url.pathname).toBe("/repos/dogama/app/issues/42")

    if (init?.method === "PATCH") {
      expect(JSON.parse(String(init.body))).toEqual({ labels: [], state: "closed" })
    }

    return Response.json({ ...issue(42), state: "closed", labels: [] })
  })
  const result = JSON.parse(await api.execute("github_issue_update", { number: 42, labels: [], state: "closed" }))

  expect(result.state).toBe("closed")
  expect(result.labels).toEqual([])
  expect(api.requests).toHaveLength(2)
})

test("silently ignored labels are a failed write, with the issue identity for reconciliation", async () => {
  const api = setup((_url, init) => Response.json({ ...issue(42), labels: init?.method === "POST" ? [{ name: "bug" }] : [] }))

  await expect(api.execute("github_issue_create", { title: "Checkout failure", body: "<!-- dogama:error:123 -->", labels: ["bug"] })).rejects.toThrow("GitHub issue #42 did not confirm")
  expect(api.requests).toHaveLength(2)
})

test.each(["rejected", "timeout", "read-back failure"])("creation does not retry after %s", async (failure) => {
  const api = setup((_url, init) => {
    if (failure === "timeout") {
      throw new Error("Request timed out")
    }

    if (failure === "read-back failure" && init?.method === "POST") {
      return Response.json(issue(42), { status: 201 })
    }

    return Response.json({ message: "Failed" }, { status: 422 })
  })

  await expect(api.execute("github_issue_create", { title: "Checkout failure", body: "<!-- dogama:error:123 -->", labels: ["bug"] })).rejects.toThrow()
  expect(api.requests.filter((request) => request.init?.method === "POST")).toHaveLength(1)
})

test.each([
  ["github_issue_create", { title: " ", body: "failure", labels: [] }],
  ["github_issue_update", { number: 42 }],
  ["github_issue_update", { number: -1, state: "closed" }],
  ["github_issues_list", { state: "merged" }],
  ["github_issues_list", { labels: "bug" }],
  ["github_labels_list", { unexpected: true }],
])("%s rejects invalid input before accessing GitHub", async (name, input) => {
  const api = setup(() => { throw new Error("Unexpected HTTP request") })

  await expect(api.execute(name, input)).rejects.toThrow()
  expect(api.requests).toHaveLength(0)
})

test("PR reconciliation sends head, base and all states", async () => {
  const api = setup((url) => {
    expect(url.pathname).toBe("/repos/dogama/app/pulls")
    expect(url.searchParams.get("state")).toBe("all")
    expect(url.searchParams.get("head")).toBe("dogama:fix/error-123")
    expect(url.searchParams.get("base")).toBe("dev")

    return Response.json([{ ...issue(43), draft: true, head: { ref: "fix/error-123", sha: "abc" }, base: { ref: "dev" } }])
  })
  const result = JSON.parse(await api.execute("github_pull_requests_list", { state: "all", head: "dogama:fix/error-123", base: "dev" }))

  expect(result[0]).toMatchObject({ number: 43, draft: true, head: { ref: "fix/error-123", sha: "abc" }, base: { ref: "dev" } })
})

test("label discovery loads every page", async () => {
  const api = setup((url) => {
    expect(url.pathname).toBe("/repos/dogama/app/labels")

    if (url.searchParams.get("page") === "1") {
      return Response.json(Array.from({ length: 100 }, (_, index) => ({ name: `label-${index}` })))
    }

    return Response.json([{ name: "bug", color: "ff0000" }])
  })
  const result = JSON.parse(await api.execute("github_labels_list", {}))

  expect(result).toHaveLength(101)
  expect(result.at(-1)).toEqual({ name: "bug", color: "ff0000" })
})
