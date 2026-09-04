import { z } from "zod"
import { parse } from "@src/shared/parse"
import { createGithubApp } from "./github-app"
import { createRelayApp } from "./relay-app"
import { openRelayDatabase } from "./relay-database"
import { createRelaySecrets } from "./relay-secrets"

const environmentSchema = z.object({
  GITHUB_APP_ID: z.string().min(1),
  GITHUB_APP_SLUG: z.string().min(1),
  GITHUB_APP_PRIVATE_KEY: z.string().min(1).optional(),
  GITHUB_APP_PRIVATE_KEY_PATH: z.string().min(1).optional(),
  GITHUB_WEBHOOK_SECRET: z.string().min(32),
  GITHUB_RELAY_SECRET_KEY: z.string().regex(/^[0-9a-f]{64}$/),
  GITHUB_RELAY_BASE_URL: z.url(),
  GITHUB_RELAY_DATABASE_PATH: z.string().min(1),
  GITHUB_RELAY_HOSTNAME: z.string().min(1).default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(8787),
})
const environment = parse(environmentSchema, process.env)

async function loadPrivateKey() {
  if (environment.GITHUB_APP_PRIVATE_KEY) {
    return environment.GITHUB_APP_PRIVATE_KEY
  }

  if (environment.GITHUB_APP_PRIVATE_KEY_PATH) {
    return Bun.file(environment.GITHUB_APP_PRIVATE_KEY_PATH).text()
  }

  throw new Error("GITHUB_APP_PRIVATE_KEY or GITHUB_APP_PRIVATE_KEY_PATH is required")
}

const privateKey = await loadPrivateKey()
const secrets = createRelaySecrets(environment.GITHUB_RELAY_SECRET_KEY)
const database = openRelayDatabase(environment.GITHUB_RELAY_DATABASE_PATH, secrets)
const github = createGithubApp({ appId: environment.GITHUB_APP_ID, appSlug: environment.GITHUB_APP_SLUG, privateKey, webhookSecret: environment.GITHUB_WEBHOOK_SECRET })
const app = createRelayApp({ database, github })
const server = Bun.serve({ hostname: environment.GITHUB_RELAY_HOSTNAME, port: environment.PORT, fetch: app.fetch })

console.log(`GitHub relay listening on port ${server.port} for ${environment.GITHUB_RELAY_BASE_URL}`)

async function shutdown() {
  await server.stop(true)
  database.close()
  process.exit(0)
}

process.on("SIGINT", () => void shutdown())
process.on("SIGTERM", () => void shutdown())
