import { randomBytes } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import { safeStorage } from "electron"

const keyBytes = 32

export async function loadSecretKey(path: string) {
  const encrypted = safeStorage.isEncryptionAvailable()
  const stored = await readFile(path).catch(() => {})

  if (stored) {
    return encrypted ? safeStorage.decryptString(stored) : stored.toString("utf8")
  }

  const key = randomBytes(keyBytes).toString("hex")
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, encrypted ? safeStorage.encryptString(key) : key, { mode: 0o600 })

  return key
}
