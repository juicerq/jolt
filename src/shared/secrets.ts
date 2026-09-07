import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

const algorithm = "aes-256-gcm"
const ivLength = 12
const tagLength = 16

export function createSecrets(keyHex: string) {
  const key = Buffer.from(keyHex, "hex")

  if (key.length !== 32) {
    throw new Error("The secret key must have 32 bytes")
  }

  return {
    seal(text: string) {
      const iv = randomBytes(ivLength)
      const cipher = createCipheriv(algorithm, key, iv)
      const sealed = Buffer.concat([cipher.update(text, "utf8"), cipher.final()])

      return Buffer.concat([iv, cipher.getAuthTag(), sealed]).toString("base64")
    },
    open(sealed: string) {
      const bytes = Buffer.from(sealed, "base64")
      const decipher = createDecipheriv(algorithm, key, bytes.subarray(0, ivLength))
      decipher.setAuthTag(bytes.subarray(ivLength, ivLength + tagLength))

      return Buffer.concat([decipher.update(bytes.subarray(ivLength + tagLength)), decipher.final()]).toString("utf8")
    },
  }
}

export type Secrets = ReturnType<typeof createSecrets>
