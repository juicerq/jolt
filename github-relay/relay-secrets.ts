import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"

const algorithm = "aes-256-gcm"
const ivLength = 12
const tagLength = 16

export function createRelaySecrets(keyHex: string) {
  const key = Buffer.from(keyHex, "hex")

  if (key.length !== 32) {
    throw new Error("GITHUB_RELAY_SECRET_KEY must contain 32 bytes as hexadecimal")
  }

  return {
    issue() {
      return randomBytes(32).toString("base64url")
    },
    hash(value: string) {
      return createHash("sha256").update(value).digest("hex")
    },
    seal(value: string) {
      const iv = randomBytes(ivLength)
      const cipher = createCipheriv(algorithm, key, iv)
      const sealed = Buffer.concat([cipher.update(value, "utf8"), cipher.final()])

      return Buffer.concat([iv, cipher.getAuthTag(), sealed]).toString("base64")
    },
    open(value: string) {
      const bytes = Buffer.from(value, "base64")
      const decipher = createDecipheriv(algorithm, key, bytes.subarray(0, ivLength))
      decipher.setAuthTag(bytes.subarray(ivLength, ivLength + tagLength))

      return Buffer.concat([decipher.update(bytes.subarray(ivLength + tagLength)), decipher.final()]).toString("utf8")
    },
  }
}

export type RelaySecrets = ReturnType<typeof createRelaySecrets>
