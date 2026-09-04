import { access, stat } from "node:fs/promises"
import { constants } from "node:fs"
import { isAbsolute } from "node:path"

export async function assertAccessibleWorkingDirectory(path: string) {
  if (!isAbsolute(path)) {
    throw new Error("Working directory is not accessible")
  }

  const directory = await stat(path).catch(() => {})

  if (!directory?.isDirectory()) {
    throw new Error("Working directory is not accessible")
  }

  await access(path, constants.R_OK | constants.W_OK).catch(() => {
    throw new Error("Working directory is not accessible")
  })
}
