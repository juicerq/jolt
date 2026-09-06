import { constants } from "node:fs"
import { mkdir, open, realpath } from "node:fs/promises"
import { basename, dirname, join, resolve } from "node:path"

export async function acquireEngineLock(databasePath: string) {
  const flock = Bun.which("flock")

  if (!flock) {
    throw new Error("Mimo requires flock to prevent multiple Engines from opening the same database")
  }

  const path = resolve(databasePath)
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const canonical = await realpath(path).catch(async (error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") {
      throw error
    }

    return join(await realpath(dirname(path)), basename(path))
  })
  const lockPath = `${canonical}.lock`
  const file = await open(lockPath, constants.O_CREAT | constants.O_RDWR | constants.O_NOFOLLOW, 0o600)
  await file.close()
  const child = Bun.spawn([
    flock, "--nonblock", "--conflict-exit-code", "73", "--no-fork", "--", lockPath,
    "sh", "-c", "printf ready; exec cat >/dev/null",
  ], { stdin: "pipe", stdout: "pipe", stderr: "ignore" })
  const readiness = await new Response(child.stdout).text()

  if (readiness !== "ready") {
    child.stdin.end()
    const exitCode = await child.exited
    throw new Error(exitCode === 73 ? "Another Mimo Engine already owns this database" : "Mimo could not acquire its database lock")
  }

  let released = false
  void child.exited.then(() => {
    if (!released) {
      console.error("Mimo lost its database lock; stopping the Engine")
      process.exit(1)
    }
  })

  return {
    async release() {
      if (!released) {
        released = true
        child.stdin.end()
      }

      await child.exited
    },
  }
}
