import { afterEach, expect, setSystemTime, test } from "bun:test"
import { join } from "node:path"
import { openDatabase, type AppDatabase } from "@src/engine/persistence/database"
import { createObservationSystem } from "@src/engine/observability/observability"
import type { ErrorDelivery, ErrorReport, ErrorRun } from "@src/shared/error-automation"
import { testDirectory } from "./support/test-directory"

const directory = testDirectory("mimo-error-cases-")

afterEach(() => setSystemTime())

function delivery(changes: Partial<ErrorDelivery>): ErrorDelivery {
  return { id: "delivery-1", source: "dogama", environment: "production", errorId: "error-1", revision: "9007199254740993", fingerprint: "checkout", type: "TypeError", title: "Checkout failed", severity: "error", count: "1", countDelta: "1", firstSeenAt: "2026-09-05T00:00:00Z", lastSeenAt: "2026-09-05T00:00:00Z", status: "pending", reopenedAt: null, codeVersion: "a".repeat(40), contexts: [{ id: "context-1", content: "checkout stack", pruned: false }], ...changes }
}

function report(run: ErrorRun, changes: Partial<ErrorReport>): ErrorReport {
  return { caseId: run.caseId, revision: run.revision, codeVersion: "a".repeat(40), classification: "product_bug", observed: "Checkout fails", expected: "Checkout completes", expectedSource: "Checkout contract", impact: "Payment cannot proceed", proof: { kind: "causal_chain", description: "Invalid value reaches an unconditional throw" }, evidence: [{ path: "src/checkout.ts", line: 12, quote: "throw new Error()", explanation: "Invalid value is not handled" }], gaps: [], ...changes }
}

async function withDatabase(check: (database: AppDatabase, reopen: () => AppDatabase) => void | Promise<void>) {
  const { observability } = createObservationSystem({ appSessionId: "test-errors", logDirectory: join(directory, "logs"), development: false, outputs: [] })
  const path = join(directory, "mimo.sqlite")
  const database = openDatabase(path, observability)

  try {
    await check(database, () => openDatabase(path, observability))
  } finally {
    database.close()
    await observability.flush()
  }
}

test("deliveries deduplicate durably, compare BigInt revisions and acknowledge only the matching source", async () => {
  await withDatabase(({ errorCases: cases }, reopen) => {
    const input = delivery({})
    const first = cases.ingest(input)
    expect(cases.ingest(input).id).toBe(first.id)
    expect(() => cases.ingest({ ...input, title: "Different payload" })).toThrow("different payload")
    expect(cases.ingest(delivery({ id: "older", revision: "9007199254740992" })).revision).toBe(input.revision)
    cases.ingest(delivery({ id: "delivery-1", source: "other-source" }))
    cases.acknowledge([input.id], input.source, input.environment)
    const second = reopen()

    try {
      expect(second.errorCases.list()).toHaveLength(2)
      expect(second.errorCases.pendingAcks().sort((a, b) => a.id.localeCompare(b.id))).toEqual([{ id: "older", source: "dogama", environment: "production" }, { id: "delivery-1", source: "other-source", environment: "production" }].sort((a, b) => a.id.localeCompare(b.id)))
    } finally {
      second.close()
    }
  })
})

test("frequency-only deliveries retain the lease; new context preserves unknown publication and stores a late report without accepting it", async () => {
  await withDatabase(({ errorCases: cases }) => {
    const first = cases.ingest(delivery({}))
    cases.update(first.id, { issueState: "unknown", issueDraft: "durable marker", branch: "fix/error-1" })
    const run = cases.claim(first.id, "analysis", 10, 2, 60_000)!
    const repeated = cases.ingest(delivery({ id: "delivery-2", revision: "9007199254740994", count: "2", contexts: [{ id: "context-2", content: "checkout stack", pruned: false }] }))
    expect(repeated.leaseId).toBe(run.id)
    expect(repeated.contextHash).toBe(first.contextHash)
    expect(repeated.attempts).toBe(1)
    const next = cases.ingest(delivery({ id: "delivery-3", revision: "9007199254740995", contexts: [{ id: "context-3", content: "new stack", pruned: false }] }))
    expect(next).toMatchObject({ state: "queued", leaseId: null, attempts: 0, issueState: "unknown", issueDraft: "durable marker", branch: "fix/error-1" })
    const result = cases.finish(run.id, { report: report(run, {}), tokens: 123, cost: 0.01 })
    expect(result.current).toBe(false)
    expect(result.case.report).toBeNull()
    expect(cases.status().runs[0]).toMatchObject({ id: run.id, status: "stale", report: JSON.stringify(report(run, {})), tokens: 123, cost: 0.01 })
  })
})

test("independent SQLite clients share exclusive leases, heartbeats and recovery", async () => {
  await withDatabase(({ errorCases: cases }, reopen) => {
    setSystemTime(new Date("2026-09-05T12:00:00Z"))
    const first = cases.ingest(delivery({}))
    const other = cases.ingest(delivery({ id: "other", errorId: "error-2" }))
    const second = reopen()

    try {
      const run = cases.claim(first.id, "analysis", 10, 1, 1_000)!
      expect(second.errorCases.claim(first.id, "analysis", 10, 1, 1_000)).toBeUndefined()
      expect(second.errorCases.claim(other.id, "analysis", 10, 1, 1_000)).toBeUndefined()
      setSystemTime(new Date("2026-09-05T12:00:00.500Z"))
      expect(cases.touchLease(run.id, 2_000)).toBe(true)
      setSystemTime(new Date("2026-09-05T12:00:01.500Z"))
      expect(second.errorCases.recover()).toBe(0)
      setSystemTime(new Date("2026-09-05T12:00:03Z"))
      expect(cases.touchLease(run.id, 1_000)).toBe(false)
      expect(second.errorCases.recover()).toBe(1)
      const replacement = second.errorCases.claim(first.id, "analysis", 10, 1, 1_000)!
      expect(replacement.id).not.toBe(run.id)
      expect(cases.touchLease(run.id, 1_000)).toBe(false)
      expect(cases.finish(run.id, { report: report(run, {}) }).current).toBe(false)
      expect(cases.get(first.id)?.leaseId).toBe(replacement.id)
      expect(cases.status().runs.find((value) => value.id === run.id)?.status).toBe("interrupted")
    } finally {
      second.close()
    }
  })
})

test("restart recovers every unfinished kind immediately while preserving publication identities", async () => {
  await withDatabase(({ errorCases: cases }, reopen) => {
    const before = new Date("2026-09-05T12:00:00Z")
    setSystemTime(before)
    const scenarios = [{ kind: "analysis", ready: "queued", recovered: "queued" }, { kind: "review", ready: "review", recovered: "review" }, { kind: "correction", ready: "issue_open", recovered: "issue_open" }] as const
    const runs = scenarios.map((scenario, index) => {
      const record = cases.ingest(delivery({ id: `delivery-${index}`, errorId: `error-${index}` }))
      cases.update(record.id, { state: scenario.ready, issueState: "published", issueNumber: 42 + index, issueUrl: `https://github.com/dogama/app/issues/${42 + index}`, branch: `fix/error-${index}`, prState: "creating" })

      return { ...scenario, run: cases.claim(record.id, scenario.kind, 10, 3, 60_000)! }
    })
    expect(cases.recover()).toBe(0)
    const restarted = reopen()

    try {
      expect(restarted.errorCases.recoverAfterRestart()).toBe(3)
      expect(restarted.errorCases.recoverAfterRestart()).toBe(0)

      for (const [index, { run, recovered }] of runs.entries()) {
        expect(restarted.errorCases.get(run.caseId)).toMatchObject({ state: recovered, leaseId: null, leaseUntil: null, issueState: "published", issueNumber: 42 + index, branch: `fix/error-${index}`, prState: "creating" })
        expect(restarted.errorCases.status().runs.find((value) => value.id === run.id)).toMatchObject({ status: "interrupted", finishedAt: before.toISOString() })
        expect(restarted.errorCases.touchLease(run.id, 60_000)).toBe(false)
      }
    } finally {
      restarted.close()
    }
  })
})

test("daily budget counts analysis, review and correction, while correction attempts survive new context", async () => {
  await withDatabase(({ errorCases: cases }) => {
    setSystemTime(new Date("2026-09-05T12:00:00Z"))
    const first = cases.ingest(delivery({}))
    const analysis = cases.claim(first.id, "analysis", 3, 1, 60_000)!
    cases.ingest(delivery({ id: "frequency", revision: "9007199254740994", count: "2" }))
    expect(cases.finish(analysis.id, { report: report(analysis, {}) }).current).toBe(true)
    const review = cases.claim(first.id, "review", 3, 1, 60_000)!
    cases.decide({ caseId: first.id, revision: analysis.revision, verdict: "confirmed", reason: "Causal chain verified" })
    expect(cases.finish(review.id, { rawResponse: "approved" }).case.state).toBe("confirmed")
    cases.update(first.id, { state: "issue_open", issueState: "published", issueNumber: 42 })
    const correction = cases.claim(first.id, "correction", 3, 1, 60_000)!
    cases.finish(correction.id, { error: "Correction failed", tokens: 50 })
    expect(cases.attempts(first.id, "correction")).toBe(1)
    expect(cases.status().todayTurns).toBe(3)
    cases.ingest(delivery({ id: "new-context", revision: "9007199254740995", contexts: [{ id: "new", content: "new context", pruned: false }] }))
    expect(cases.attempts(first.id, "correction")).toBe(1)
    expect(cases.claim(first.id, "analysis", 3, 1, 60_000)).toBeUndefined()
    setSystemTime(new Date("2026-09-06T00:00:00Z"))
    expect(cases.status().todayTurns).toBe(0)
    expect(cases.claim(first.id, "analysis", 3, 1, 60_000)).toBeDefined()
  })
})

test("status aggregates all cases beyond the display limit and retains usage recorded before a failed finish", async () => {
  await withDatabase(({ errorCases: cases }) => {
    setSystemTime(new Date("2026-09-04T12:00:00Z"))
    const historic = cases.ingest(delivery({ id: "historic", errorId: "historic" }))
    const oldRun = cases.claim(historic.id, "analysis", 10, 1, 60_000)!
    cases.finish(oldRun.id, { report: report(oldRun, { classification: "external" }), tokens: 999, cost: 99 })
    cases.decide({ caseId: historic.id, revision: oldRun.revision, verdict: "external", reason: "Provider outage" })
    setSystemTime(new Date("2026-09-05T12:00:00Z"))
    const records = Array.from({ length: 501 }, (_, index) => cases.ingest(delivery({ id: `delivery-${index}`, errorId: `error-${index}` })))
    const success = cases.claim(records[0]!.id, "analysis", 10, 2, 60_000)!
    cases.finish(success.id, { report: report(success, {}), tokens: 100, cost: 1 })
    const failed = cases.claim(records[1]!.id, "analysis", 10, 2, 60_000)!
    cases.recordUsage(failed.id, { tokens: 25, cost: 0.25 })
    cases.finish(failed.id, { rawResponse: "not JSON", error: "Invalid report" })
    const status = cases.status()
    expect(status.cases).toHaveLength(500)
    expect(status.counts).toEqual({ external: 1, review: 1, inconclusive: 1, queued: 499 })
    expect(status.classifications).toEqual({ external: 1, product_bug: 1 })
    expect(status).toMatchObject({ todayTurns: 2, todayTokens: 125, todayNominalCost: 1.25, oldestQueuedAt: "2026-09-05T12:00:00.000Z" })
    expect(status.runs.find((run) => run.id === failed.id)).toMatchObject({ tokens: 25, cost: 0.25, status: "failed" })
  })
})

test("frequency updates retain queue age while a new investigation starts its own wait", async () => {
  await withDatabase(({ errorCases: cases }) => {
    setSystemTime(new Date("2026-09-05T12:00:00Z"))
    cases.ingest(delivery({ revision: "1" }))
    setSystemTime(new Date("2026-09-05T13:00:00Z"))
    cases.ingest(delivery({ id: "repeat", revision: "2", count: "2" }))
    expect(cases.status().oldestQueuedAt).toBe("2026-09-05T12:00:00.000Z")
    setSystemTime(new Date("2026-09-05T14:00:00Z"))
    cases.ingest(delivery({ id: "new-proof", revision: "3", contexts: [{ id: "new", content: "new cause", pruned: false }] }))
    expect(cases.status().oldestQueuedAt).toBe("2026-09-05T14:00:00.000Z")
  })
})

test("retirement selects only bots whose latest finished run is old and preserves active or reused bots", async () => {
  await withDatabase(({ errorCases: cases }) => {
    setSystemTime(new Date("2026-07-01T12:00:00Z"))

    for (const botId of ["retired", "reused", "running"]) {
      const record = cases.ingest(delivery({ id: botId, errorId: botId }))
      const run = cases.claim(record.id, "analysis", 10, 3, 100 * 86_400_000)!
      cases.bindRun(run.id, botId, `task-${botId}`)

      if (botId !== "running") {
        cases.finish(run.id, { report: report(run, {}) })
      }
    }

    setSystemTime(new Date("2026-09-05T12:00:00Z"))
    const recent = cases.ingest(delivery({ id: "recent", errorId: "recent" }))
    const reused = cases.claim(recent.id, "analysis", 10, 3, 60_000)!
    cases.bindRun(reused.id, "reused", "recent-task")
    cases.finish(reused.id, { report: report(reused, {}) })
    expect(cases.retiredBots("2026-08-06T12:00:00Z")).toEqual(["retired"])
    expect(cases.status().runs).toHaveLength(4)
  })
})

test("two processes racing for the same case create exactly one run", async () => {
  await withDatabase(async ({ errorCases: cases }) => {
    const first = cases.ingest(delivery({}))
    const script = `
      import { Database } from "bun:sqlite";
      import { createErrorCases } from ${JSON.stringify(new URL("../src/engine/persistence/error-cases.ts", import.meta.url).pathname)};
      const sqlite = new Database(${JSON.stringify(join(directory, "mimo.sqlite"))});
      sqlite.run("PRAGMA busy_timeout = 5000");
      await Bun.stdin.text();
      try {
        const run = createErrorCases(sqlite).claim(${JSON.stringify(first.id)}, "analysis", 10, 2, 60000);
        process.stdout.write(JSON.stringify(run?.id ?? null));
      } finally { sqlite.close(); }
    `
    const processes = [0, 1].map(() => Bun.spawn([process.execPath, "--eval", script], { stdin: "pipe", stdout: "pipe", stderr: "pipe" }))

    try {
      for (const child of processes) {
        child.stdin.end()
      }

      const results = await Promise.all(processes.map(async (child) => {
        const [stdout, stderr, exit] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
        expect(stderr).toBe("")
        expect(exit).toBe(0)

        return JSON.parse(stdout)
      }))
      expect(results.filter((value) => value !== null)).toHaveLength(1)
      expect(cases.attempts(first.id, "analysis")).toBe(1)
    } finally {
      for (const child of processes) {
        child.kill()
      }

      await Promise.all(processes.map((child) => child.exited))
    }
  })
})

test.each(["valid", "invalid"])("finishing a %s report twice preserves its first recorded outcome and usage", async (validity) => {
  await withDatabase(({ errorCases: cases }) => {
    const first = cases.ingest(delivery({}))
    const run = cases.claim(first.id, "analysis", 10, 1, 60_000)!

    if (validity === "valid") {
      cases.finish(run.id, { report: report(run, {}), tokens: 120, cost: 0.03 })
    } else {
      cases.finish(run.id, { rawResponse: "{malformed JSON", tokens: 120, cost: 0.03 })
    }

    const recorded = cases.status().runs[0]
    expect(recorded.status).toBe(validity === "valid" ? "done" : "failed")
    expect(cases.finish(run.id, { error: "duplicate callback" }).current).toBe(false)
    expect(cases.status().runs[0]).toEqual(recorded)

    if (validity === "invalid") {
      expect(recorded.report).toBe("{malformed JSON")
      expect(cases.get(first.id)?.state).toBe("inconclusive")
    }
  })
})

test.each(["case", "revision"])("a report for a different %s is stored as a failure", async (mismatch) => {
  await withDatabase(({ errorCases: cases }) => {
    const first = cases.ingest(delivery({}))
    const run = cases.claim(first.id, "analysis", 10, 1, 60_000)!
    const invalid = report(run, mismatch === "case" ? { caseId: "other" } : { revision: "1" })
    const result = cases.finish(run.id, { report: invalid })
    expect(result.case.state).toBe("inconclusive")
    expect(result.case.report).toBeNull()
    expect(cases.status().runs[0]).toMatchObject({ status: "failed", report: JSON.stringify(invalid) })
  })
})

test.each<Partial<ErrorReport>>([
  { proof: { kind: "missing", description: "Not reproduced" } },
  { evidence: [] },
  { gaps: ["Cannot locate expected behavior"] },
  { classification: "expected" },
])("the leader cannot confirm a report missing sufficient proof: %j", async (changes) => {
  await withDatabase(({ errorCases: cases }) => {
    const first = cases.ingest(delivery({}))
    const run = cases.claim(first.id, "analysis", 10, 1, 60_000)!
    cases.finish(run.id, { report: report(run, changes) })
    expect(() => cases.decide({ caseId: first.id, revision: run.revision, verdict: "confirmed", reason: "Looks like a bug" })).toThrow("requires matching classification, proof, evidence and no gaps")
    expect(cases.get(first.id)?.decision).toBeNull()
  })
})
