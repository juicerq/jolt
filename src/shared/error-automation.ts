import { z } from "zod"

const id = z.string().min(1).max(256)
const text = z.string().min(1).max(20_000)
const revision = z.string().regex(/^\d+$/)
const commit = z.string().regex(/^[a-f0-9]{40}$/)
const classification = z.enum(["product_bug", "observability_bug", "expected", "external", "inconclusive"])
const delivery = z.strictObject({
  id, source: id, environment: id, errorId: id, revision,
  fingerprint: z.string().nullable(), type: id, title: text, severity: id,
  count: revision, countDelta: revision,
  firstSeenAt: z.iso.datetime(), lastSeenAt: z.iso.datetime(),
  status: z.enum(["pending", "fixed", "ignored"]), reopenedAt: z.iso.datetime().nullable(),
  codeVersion: commit.nullable(),
  contexts: z.array(z.strictObject({ id, content: z.string().max(100_000), pruned: z.boolean() })).max(100),
})
const evidence = z.strictObject({ path: z.string().min(1).max(1024).refine((value) => !value.startsWith("/") && !value.split(/[\\/]/).includes("..")), line: z.int().positive(), quote: text, explanation: text })
const report = z.strictObject({
  caseId: id, revision, codeVersion: commit, classification,
  observed: text, expected: text, expectedSource: text, impact: text,
  proof: z.strictObject({ kind: z.enum(["reproduction", "causal_chain", "missing"]), description: text }),
  evidence: z.array(evidence).max(30), gaps: z.array(text).max(20),
  internalFixHypothesis: z.string().max(20_000).optional(),
})
const decision = z.strictObject({ caseId: id, revision, verdict: z.enum(["confirmed", "expected", "external", "inconclusive"]), reason: text })
const config = z.strictObject({
  projectId: id, dogamaBotId: id,
  sourceUrl: z.url().refine((value) => { const url = new URL(value); return !url.username && !url.password && (url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) }),
  repositoryDirectory: text,
  githubAccountId: id.nullable().default(null),
  collect: z.boolean().default(true), analyze: z.boolean().default(false), publish: z.boolean().default(false), correct: z.boolean().default(false),
  releaseCorrections: z.boolean().default(false),
  dailyTurnLimit: z.int().positive().max(10_000).nullable().default(null),
  concurrency: z.int().min(1).max(8).default(2),
  maxLunaAttempts: z.int().min(1).max(2).default(2),
  analysisLeaderId: id.nullable().default(null), correctionLeaderId: id.nullable().default(null),
})
const caseState = z.enum(["queued", "analyzing", "review", "confirmed", "expected", "external", "inconclusive", "issue_open", "fixing", "fix_failed", "pr_open", "merged", "published", "verified"])
const caseRecord = z.strictObject({
  id, source: id, environment: id, errorId: id, revision, delivery, contextHash: id,
  state: caseState, queuedAt: z.string().nullable().default(null), report: report.nullable(), decision: decision.nullable(),
  leaseId: id.nullable(), leaseUntil: z.number().nullable(), attempts: z.int(),
  issueState: z.enum(["none", "creating", "unknown", "published"]), issueNumber: z.int().nullable(), issueUrl: z.string().nullable(), issueDraft: z.string().nullable(),
  branch: z.string().nullable(), prNumber: z.int().nullable(), prUrl: z.string().nullable(),
  prState: z.enum(["none", "creating", "unknown", "published"]).default("none"),
  publishedVersion: z.string().nullable(), verification: z.string().nullable(),
  failure: z.string().nullable(), createdAt: z.string(), updatedAt: z.string(),
})
const run = z.strictObject({
  id, caseId: id, revision, contextHash: id, kind: z.enum(["analysis", "review", "correction"]),
  status: z.enum(["running", "done", "failed", "interrupted", "stale"]),
  botId: id.nullable(), taskId: id.nullable(), report: z.string().nullable(), error: z.string().nullable(),
  tokens: z.number().nullable(), cost: z.number().nullable(), createdAt: z.string(), finishedAt: z.string().nullable(),
})

export const errorAutomationSchemas = {
  config, delivery, report, decision, caseRecord, run,
  deliveries: z.strictObject({ deliveries: z.array(delivery).max(100) }),
  configure: config.extend({ sourceToken: z.string().min(16).optional(), verificationToken: z.string().min(16).optional() }),
  idInput: z.strictObject({ caseId: id }),
  verify: z.strictObject({ caseId: id, publishedVersion: commit, evidence: text, representativeTraffic: text }),
  status: z.strictObject({ config: config.nullable(), sourceConnected: z.boolean(), verificationConnected: z.boolean().default(false), cases: z.array(caseRecord), runs: z.array(run), todayTurns: z.int(), lastReceivedAt: z.string().nullable(), failure: z.string().nullable(),
    counts: z.record(z.string(), z.int()), classifications: z.record(z.string(), z.int()), oldestQueuedAt: z.string().nullable(), todayTokens: z.number(), todayNominalCost: z.number(),
  }),
}
export type ErrorDelivery = z.infer<typeof delivery>
export type ErrorReport = z.infer<typeof report>
export type ErrorDecision = z.infer<typeof decision>
export type ErrorCase = z.infer<typeof caseRecord>
export type ErrorRun = z.infer<typeof run>
export type ErrorAutomationConfig = z.infer<typeof config>
