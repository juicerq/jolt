import { z } from "zod"

const triggerSources = ["github"] as const
export const githubTriggerEvents = ["issues", "issue_comment", "pull_request", "pull_request_review", "pull_request_review_comment", "check_run"] as const

const id = z.string().min(1)
const triggerSource = z.enum(triggerSources)
const githubEvent = z.enum(githubTriggerEvents)
const repository = z.strictObject({ id, fullName: id })
const status = z.enum(["active", "paused"])
const runStatus = z.enum(["queued", "running", "completed", "failed", "ignored"])
const trigger = z.strictObject({
  id,
  botId: id,
  accountId: id,
  source: triggerSource,
  name: id,
  event: githubEvent,
  actions: z.array(id).min(1),
  repositories: z.array(repository).min(1),
  labels: z.array(id),
  instruction: id,
  includeOwnEvents: z.boolean(),
  status,
  createdAt: id,
})
const subject = z.strictObject({ id, kind: id, number: z.int().positive().optional(), title: id.optional(), url: z.url().optional() })
const externalEvent = z.strictObject({
  deliveryId: id,
  installationId: id,
  source: z.literal("github"),
  event: githubEvent,
  action: id,
  repository,
  labels: z.array(id),
  sender: z.strictObject({ login: id, type: id }),
  subject,
  content: z.string(),
  occurredAt: id,
  ownEvent: z.boolean(),
})
const triggerRun = z.strictObject({
  id,
  triggerId: id,
  botId: id,
  deliveryId: id,
  event: externalEvent,
  status: runStatus,
  error: z.string().nullable(),
  createdAt: id,
  startedAt: id.nullable(),
  finishedAt: id.nullable(),
})
const createInput = trigger.omit({ id: true, source: true, createdAt: true })

export const triggerSchemas = {
  trigger,
  triggerList: z.array(trigger),
  triggerRun,
  externalEvent,
  createInput,
  updateInput: trigger.pick({ id: true, name: true, event: true, actions: true, repositories: true, labels: true, instruction: true, includeOwnEvents: true, status: true }),
  idInput: z.strictObject({ id }),
  botInput: z.strictObject({ botId: id }),
  ingestInput: externalEvent,
}

export type Trigger = z.infer<typeof trigger>
export type TriggerRun = z.infer<typeof triggerRun>
export type ExternalEvent = z.infer<typeof externalEvent>
