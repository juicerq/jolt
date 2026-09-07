import { randomBytes } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import { safeStorage } from "electron"

const secretBytes = 32

export async function renewSecret(path: string) {
  const secret = randomBytes(secretBytes).toString("hex")
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(secret) : secret, { mode: 0o600 })

  return secret
}

export async function loadSecret(path: string) {
  const stored = await readFile(path).catch(() => {})

  if (!stored) {
    return renewSecret(path)
  }

  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.decryptString(stored)
  }

  return stored.toString("utf8")
}
