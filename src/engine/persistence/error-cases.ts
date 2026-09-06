import type { Database } from "bun:sqlite"
import { createHash } from "node:crypto"
import { errorAutomationSchemas, type ErrorAutomationConfig, type ErrorCase, type ErrorDelivery, type ErrorReport, type ErrorRun } from "@src/shared/error-automation"
import { parse } from "@src/shared/parse"

function contextHash(delivery: ErrorDelivery) {
  const contexts = [...new Set(delivery.contexts.map(({ content, pruned }) => JSON.stringify({ content, pruned })))].sort()

  return createHash("sha256").update(JSON.stringify({ contexts, type: delivery.type, fingerprint: delivery.fingerprint, codeVersion: delivery.codeVersion, reopenedAt: delivery.reopenedAt })).digest("hex")
}

// Valida o relatório contra a execução que o produziu e devolve o erro que ele representa.
function evaluateReport(run: ErrorRun, result: { report?: ErrorReport; error?: string }) {
  const validated = errorAutomationSchemas.report.safeParse(result.report)
  const report = validated.success ? validated.data : null
  const invalidReport = (result.report !== undefined && (!report || report.caseId !== run.caseId || report.revision !== run.revision)) || (run.kind === "analysis" && !report)

  return { report, error: result.error ?? (invalidReport ? "Run did not produce a valid report for its case and revision" : null) }
}

// Traduz o desfecho de uma execução aceita nas mudanças do caso.
function finishedCaseChanges(run: ErrorRun, report: ErrorReport | null, error: string | null, finishedAt: string) {
  const changes: Partial<ErrorCase> = { leaseId: null, leaseUntil: null, updatedAt: finishedAt }

  if (run.kind === "analysis") {
    changes.state = error ? "inconclusive" : "review"
    changes.report = error ? null : report
    changes.decision = null
    changes.failure = error
  }

  if (run.kind === "correction" && error) {
    changes.state = "fix_failed"
    changes.failure = error
  }

  if (run.kind === "review" && error) {
    changes.failure = error
  }

  return changes
}

export function createErrorCases(sqlite: Database) {
  function get(id: string) {
    const row = sqlite.query<{ data: string }, [string]>("SELECT data FROM error_cases WHERE id = ?").get(id)

    if (!row) {
      return
    }

    return parse(errorAutomationSchemas.caseRecord, JSON.parse(row.data))
  }

  function requireCase(id: string) {
    const current = get(id)

    if (!current) {
      throw new Error("Error case not found")
    }

    return current
  }

  function save(value: ErrorCase) {
    const current = parse(errorAutomationSchemas.caseRecord, value)
    sqlite.query(`INSERT INTO error_cases (id, source, environment, error_id, revision, context_hash, state, lease_id, lease_until, created_at, updated_at, data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET revision=excluded.revision, context_hash=excluded.context_hash, state=excluded.state,
      lease_id=excluded.lease_id, lease_until=excluded.lease_until, updated_at=excluded.updated_at, data=excluded.data`)
      .run(current.id, current.source, current.environment, current.errorId, current.revision, current.contextHash, current.state, current.leaseId, current.leaseUntil, current.createdAt, current.updatedAt, JSON.stringify(current))

    return current
  }

  function saveRun(value: ErrorRun) {
    const run = parse(errorAutomationSchemas.run, value)
    sqlite.query(`INSERT INTO error_runs (id, case_id, kind, status, created_at, data) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET status=excluded.status, data=excluded.data`)
      .run(run.id, run.caseId, run.kind, run.status, run.createdAt, JSON.stringify(run))

    return run
  }

  function getRun(id: string) {
    const row = sqlite.query<{ data: string }, [string]>("SELECT data FROM error_runs WHERE id = ?").get(id)

    if (!row) {
      throw new Error("Error run not found")
    }

    return parse(errorAutomationSchemas.run, JSON.parse(row.data))
  }

  function todayTurns() {
    return sqlite.query<{ count: number }, [string]>("SELECT count(*) AS count FROM error_runs WHERE created_at >= ?").get(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`)?.count ?? 0
  }

  function settings() {
    return sqlite.query<{ config: string; secret: string | null; verification_secret: string | null; last_received_at: string | null; failure: string | null }, []>("SELECT config, secret, verification_secret, last_received_at, failure FROM error_automation_settings WHERE id = 1").get()
  }

  function list(limit = -1) {
    // ponytail: scan persisted cases during the small pilot; page the scheduler and detail RPC when measured queue size requires it.
    return sqlite.query<{ data: string }, [number]>("SELECT data FROM error_cases ORDER BY updated_at DESC, id DESC LIMIT ?").all(limit).map((row) => parse(errorAutomationSchemas.caseRecord, JSON.parse(row.data)))
  }

  const recover = sqlite.transaction(() => {
    const now = Date.now()
    const finishedAt = new Date(now).toISOString()
    const rows = sqlite.query<{ data: string }, [number]>(`SELECT r.data FROM error_runs r JOIN error_cases c ON c.id = r.case_id
      WHERE r.status = 'running' AND (c.lease_id IS NULL OR c.lease_id != r.id OR c.lease_until IS NULL OR c.lease_until <= ?)`)
      .all(now)

    for (const row of rows) {
      const run = parse(errorAutomationSchemas.run, JSON.parse(row.data))
      const current = requireCase(run.caseId)
      saveRun({ ...run, status: "interrupted", error: "Run lease expired or its context was replaced", finishedAt })

      if (current.leaseId !== run.id) {
        continue
      }

      const state: ErrorCase["state"] = ({ analysis: "queued", review: "review", correction: "issue_open" } as const)[run.kind]
      save({ ...current, state: ["analyzing", "review", "fixing"].includes(current.state) ? state : current.state, leaseId: null, leaseUntil: null, updatedAt: finishedAt })
    }

    return rows.length
  })

  return {
    get,
    list,
    recoverAfterRestart() {
      return sqlite.transaction(() => {
        for (const current of list()) {
          if (current.leaseId) {
            save({ ...current, leaseUntil: 0 })
          }
        }
        return recover.immediate()
      }).immediate()
    },
    getConfig() {
      const row = settings()

      if (!row) {
        return null
      }

      return { config: parse(errorAutomationSchemas.config, JSON.parse(row.config)), secret: row.secret, verificationSecret: row.verification_secret }
    },
    configure(config: ErrorAutomationConfig, secret?: string, verificationSecret?: string) {
      const value = parse(errorAutomationSchemas.config, config)
      sqlite.query(`INSERT INTO error_automation_settings (id, config, secret, verification_secret) VALUES (1, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET config=excluded.config, secret=coalesce(excluded.secret, error_automation_settings.secret), verification_secret=coalesce(excluded.verification_secret, error_automation_settings.verification_secret)`)
        .run(JSON.stringify(value), secret ?? null, verificationSecret ?? null)
    },
    status() {
      const row = settings()
      const runs = sqlite.query<{ data: string }, []>("SELECT data FROM error_runs ORDER BY created_at DESC, id DESC LIMIT 500").all().map((value) => parse(errorAutomationSchemas.run, JSON.parse(value.data)))
      const counts = Object.fromEntries(sqlite.query<{ state: string; count: number }, []>("SELECT state, count(*) AS count FROM error_cases GROUP BY state").all().map((row) => [row.state, row.count]))
      const classifications = Object.fromEntries(sqlite.query<{ classification: string; count: number }, []>("SELECT json_extract(data, '$.report.classification') AS classification, count(*) AS count FROM error_cases WHERE json_extract(data, '$.report.classification') IS NOT NULL GROUP BY classification").all().map((row) => [row.classification, row.count]))
      const oldestQueuedAt = sqlite.query<{ date: string | null }, []>("SELECT min(coalesce(json_extract(data, '$.queuedAt'), created_at)) AS date FROM error_cases WHERE state = 'queued'").get()?.date ?? null
      const usage = sqlite.query<{ tokens: number; cost: number }, [string]>("SELECT coalesce(sum(json_extract(data, '$.tokens')), 0) AS tokens, coalesce(sum(json_extract(data, '$.cost')), 0) AS cost FROM error_runs WHERE created_at >= ?").get(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`) ?? { tokens: 0, cost: 0 }

      return parse(errorAutomationSchemas.status, { config: row ? JSON.parse(row.config) : null, sourceConnected: !!row?.secret, verificationConnected: !!row?.verification_secret, cases: list(500), runs, todayTurns: todayTurns(), lastReceivedAt: row?.last_received_at ?? null, failure: row?.failure ?? null, counts, classifications, oldestQueuedAt, todayTokens: usage.tokens, todayNominalCost: usage.cost })
    },
    retiredBots(before: string) {
      return sqlite.query<{ botId: string }, [string]>(`SELECT json_extract(data, '$.botId') AS botId FROM error_runs
        WHERE json_extract(data, '$.botId') IS NOT NULL GROUP BY botId
        HAVING max(coalesce(json_extract(data, '$.finishedAt'), '9999')) < ? AND sum(status = 'running') = 0`).all(before).map((row) => row.botId)
    },
    recordUsage(runId: string, usage: { tokens: number; cost: number }) {
      const run = getRun(runId)
      saveRun({ ...run, ...usage })
    },
    noteSource(failure: string | null) {
      sqlite.query("UPDATE error_automation_settings SET failure = ? WHERE id = 1").run(failure)
    },
    received() {
      sqlite.query("UPDATE error_automation_settings SET last_received_at = ?, failure = NULL WHERE id = 1").run(new Date().toISOString())
    },
    ingest(raw: unknown): ErrorCase {
      const delivery = parse(errorAutomationSchemas.delivery, raw)
      const payload = JSON.stringify(delivery)

      return sqlite.transaction(() => {
        const duplicate = sqlite.query<{ case_id: string; payload: string }, [string, string, string]>("SELECT case_id, payload FROM error_deliveries WHERE source = ? AND environment = ? AND id = ?").get(delivery.source, delivery.environment, delivery.id)

        if (duplicate) {
          if (duplicate.payload !== payload) {
            throw new Error("Delivery identity was reused with a different payload")
          }

          return requireCase(duplicate.case_id)
        }

        const existing = sqlite.query<{ id: string }, [string, string, string]>("SELECT id FROM error_cases WHERE source = ? AND environment = ? AND error_id = ?").get(delivery.source, delivery.environment, delivery.errorId)
        const current = existing ? requireCase(existing.id) : undefined
        const id = current?.id ?? crypto.randomUUID()
        const now = new Date().toISOString()
        const hash = contextHash(delivery)
        sqlite.query("INSERT INTO error_deliveries (id, source, environment, case_id, payload, acknowledged, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)").run(delivery.id, delivery.source, delivery.environment, id, payload, now)

        if (current && BigInt(delivery.revision) <= BigInt(current.revision)) {
          return current
        }

        if (!current) {
          return save({ id, source: delivery.source, environment: delivery.environment, errorId: delivery.errorId, revision: delivery.revision, delivery, contextHash: hash, state: "queued", queuedAt: now, report: null, decision: null, leaseId: null, leaseUntil: null, attempts: 0, issueState: "none", issueNumber: null, issueUrl: null, issueDraft: null, branch: null, prNumber: null, prUrl: null, prState: "none", publishedVersion: null, verification: null, failure: null, createdAt: now, updatedAt: now })
        }

        if (hash !== current.contextHash) {
          return save({ ...current, revision: delivery.revision, delivery, contextHash: hash, state: "queued", queuedAt: now, report: null, decision: null, leaseId: null, leaseUntil: null, attempts: 0, failure: null, updatedAt: now })
        }

        return save({ ...current, revision: delivery.revision, delivery, updatedAt: now })
      }).immediate()
    },
    pendingAcks() {
      return sqlite.query<{ id: string; source: string; environment: string }, []>("SELECT id, source, environment FROM error_deliveries WHERE acknowledged = 0 ORDER BY created_at, id").all()
    },
    acknowledge(ids: string[], source?: string, environment?: string) {
      sqlite.transaction(() => {
        for (const id of ids) {
          sqlite.query("UPDATE error_deliveries SET acknowledged = 1 WHERE id = ? AND (? IS NULL OR source = ?) AND (? IS NULL OR environment = ?)").run(id, source ?? null, source ?? null, environment ?? null, environment ?? null)
        }
      }).immediate()
    },
    update(id: string, changes: Partial<ErrorCase>) {
      return sqlite.transaction(() => {
        const current = requireCase(id)

        for (const key of ["id", "source", "environment", "errorId", "createdAt"] as const) {
          if (changes[key] !== undefined && changes[key] !== current[key]) {
            throw new Error(`Cannot change case identity: ${key}`)
          }
        }

        return save({ ...current, ...changes, updatedAt: new Date().toISOString() })
      }).immediate()
    },
    claim(caseId: string, kind: ErrorRun["kind"], dailyLimit: number, concurrency: number, leaseMs: number) {
      if (![dailyLimit, concurrency, leaseMs].every((value) => Number.isSafeInteger(value) && value > 0)) {
        throw new Error("Run limits and lease duration must be positive integers")
      }

      return sqlite.transaction(() => {
        recover.immediate()
        const current = requireCase(caseId)
        const now = Date.now()
        const states: Record<ErrorRun["kind"], ErrorCase["state"][]> = { analysis: ["queued"], review: ["review"], correction: ["issue_open", "fix_failed"] }
        const active = sqlite.query<{ count: number }, [number]>("SELECT count(*) AS count FROM error_cases WHERE lease_id IS NOT NULL AND lease_until > ?").get(now)?.count ?? 0

        if (!states[kind].includes(current.state) || (current.leaseId && (current.leaseUntil ?? 0) > now) || active >= concurrency || todayTurns() >= dailyLimit) {
          return
        }

        const run = saveRun({ id: crypto.randomUUID(), caseId, revision: current.revision, contextHash: current.contextHash, kind, status: "running", botId: null, taskId: null, report: null, error: null, tokens: null, cost: null, createdAt: new Date(now).toISOString(), finishedAt: null })
        const state: ErrorCase["state"] = ({ analysis: "analyzing", review: "review", correction: "fixing" } as const)[kind]
        save({ ...current, state, leaseId: run.id, leaseUntil: now + leaseMs, attempts: current.attempts + Number(kind === "analysis"), updatedAt: run.createdAt })

        return run
      }).immediate()
    },
    recover() {
      return recover.immediate()
    },
    bindRun(runId: string, botId: string, taskId: string) {
      const run = getRun(runId)
      saveRun({ ...run, botId, taskId })
    },
    attempts(caseId: string, kind: ErrorRun["kind"], context?: string) {
      return sqlite.query<{ count: number }, [string, string, string | null, string | null]>("SELECT count(*) AS count FROM error_runs WHERE case_id = ? AND kind = ? AND (? IS NULL OR json_extract(data, '$.contextHash') = ?)").get(caseId, kind, context ?? null, context ?? null)?.count ?? 0
    },
    latestRun(caseId: string, kind: ErrorRun["kind"], context: string) {
      const row = sqlite.query<{ data: string }, [string, string, string]>("SELECT data FROM error_runs WHERE case_id = ? AND kind = ? AND json_extract(data, '$.contextHash') = ? ORDER BY created_at DESC, id DESC LIMIT 1").get(caseId, kind, context)

      if (!row) {
        return
      }

      return parse(errorAutomationSchemas.run, JSON.parse(row.data))
    },
    touchLease(runId: string, leaseMs: number) {
      if (!Number.isSafeInteger(leaseMs) || leaseMs <= 0) {
        throw new Error("Lease duration must be a positive integer")
      }

      return sqlite.transaction(() => {
        const run = getRun(runId)
        const current = requireCase(run.caseId)
        const now = Date.now()

        if (run.status !== "running" || current.leaseId !== run.id || (current.leaseUntil ?? 0) <= now) {
          return false
        }

        save({ ...current, leaseUntil: now + leaseMs, updatedAt: new Date(now).toISOString() })

        return true
      }).immediate()
    },
    finish(runId: string, result: { report?: ErrorReport; rawResponse?: string; error?: string; tokens?: number; cost?: number }): { current: boolean; case: ErrorCase } {
      return sqlite.transaction(() => {
        const run = getRun(runId)
        const current = requireCase(run.caseId)

        if (run.status !== "running") {
          return { current: false, case: current }
        }

        const finishedAt = new Date().toISOString()
        const { report, error } = evaluateReport(run, result)
        const accepted = current.leaseId === run.id && current.contextHash === run.contextHash && run.status === "running"
        const completedStatus = error ? "failed" : "done"
        saveRun({ ...run, status: accepted ? completedStatus : "stale", report: result.rawResponse ?? (result.report === undefined ? null : JSON.stringify(result.report)), error, tokens: result.tokens ?? run.tokens, cost: result.cost ?? run.cost, finishedAt })

        if (!accepted) {
          return { current: false, case: current }
        }

        return { current: true, case: save({ ...current, ...finishedCaseChanges(run, report, error, finishedAt) }) }
      }).immediate()
    },
    decide(raw: unknown) {
      const decision = parse(errorAutomationSchemas.decision, raw)

      return sqlite.transaction(() => {
        const current = requireCase(decision.caseId)
        const report = current.report

        if (current.state !== "review" || !report || decision.revision !== report.revision) {
          throw new Error("Decision requires the current report awaiting review")
        }

        const runs = sqlite.query<{ data: string }, [string]>("SELECT data FROM error_runs WHERE case_id = ? AND kind = 'analysis' AND status = 'done'").all(current.id)
        const evidenceIsCurrent = runs.some((row) => {
          const run = parse(errorAutomationSchemas.run, JSON.parse(row.data))

          return run.revision === report.revision && run.contextHash === current.contextHash
        })

        if (!evidenceIsCurrent) {
          throw new Error("Report evidence no longer matches the current context")
        }

        if (decision.verdict === "confirmed" && (!["product_bug", "observability_bug"].includes(report.classification) || report.proof.kind === "missing" || report.evidence.length === 0 || report.gaps.length > 0)) {
          throw new Error("Confirming a bug requires matching classification, proof, evidence and no gaps")
        }

        if ((decision.verdict === "expected" || decision.verdict === "external") && decision.verdict !== report.classification) {
          throw new Error("Decision must match the report classification")
        }

        return save({ ...current, decision, state: decision.verdict, failure: null, updatedAt: new Date().toISOString() })
      }).immediate()
    },
  }
}
