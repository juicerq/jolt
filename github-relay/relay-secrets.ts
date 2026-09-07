import { createHash, randomBytes } from "node:crypto"
import { createSecrets } from "@src/shared/secrets"

export function createRelaySecrets(keyHex: string) {
  return {
    ...createSecrets(keyHex),
    issue() {
      return randomBytes(32).toString("base64url")
    },
    hash(value: string) {
      return createHash("sha256").update(value).digest("hex")
    },
  }
}

export type RelaySecrets = ReturnType<typeof createRelaySecrets>
