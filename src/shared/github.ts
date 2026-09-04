import { z } from "zod"
import { triggerSchemas } from "./triggers"

const id = z.string().min(1)
const relayUrl = z.url().refine((value) => {
  const url = new URL(value)

  return url.protocol === "https:" || (url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost"))
})
const credentials = z.strictObject({ installationId: id, relayToken: id, relayUrl, cursor: id.optional() })
const connectionStarted = z.strictObject({ connectionId: id, connectionToken: id, installUrl: z.url() })
const connectionPending = z.strictObject({ status: z.literal("pending"), message: id.optional() })
const connectionFinished = z.strictObject({ status: z.literal("connected"), installationId: id, accountLogin: id, relayToken: id })
const installationToken = z.strictObject({ token: id, expiresAt: id })
const repository = z.looseObject({ id: z.union([z.int(), id]).transform(String), full_name: id, private: z.boolean(), html_url: z.url() }).transform((value) => ({ id: value.id, fullName: value.full_name, private: value.private, url: value.html_url }))
const repositories = z.looseObject({ repositories: z.array(repository) }).transform((value) => value.repositories)
const eventBatch = z.strictObject({ events: z.array(triggerSchemas.externalEvent), cursor: id })

export const githubSchemas = {
  repositoryTarget: z.string().max(300).regex(/^[a-zA-Z0-9][a-zA-Z0-9-]*\/[a-zA-Z0-9_.-]+$/, "Use owner/repository"),
  credentials,
  connectionStarted,
  connectionStatus: z.discriminatedUnion("status", [connectionPending, connectionFinished]),
  installationToken,
  repositories,
  eventBatch,
}

export type GithubCredentials = z.infer<typeof credentials>
