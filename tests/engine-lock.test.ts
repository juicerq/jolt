import { expect, test } from "bun:test"
import { mkdir, symlink } from "node:fs/promises"
import { join, resolve } from "node:path"
import { acquireEngineLock } from "@src/engine/persistence/engine-lock"
import { testDirectory } from "./support/test-directory"

const directory = testDirectory("mimo-engine-lock-")

test("one Engine owns a canonical database across directory and database symlinks", async () => {
  const data = join(directory, "data")
  await mkdir(data)
  const database = join(data, "mimo.sqlite")
  await Bun.write(database, "")
  await symlink(data, join(directory, "alias"))
  await symlink(database, join(directory, "database-alias.sqlite"))
  const lock = await acquireEngineLock(database)

  try {
    await expect(acquireEngineLock(join(directory, "alias/mimo.sqlite"))).rejects.toThrow("Another Mimo Engine already owns this database")
    await expect(acquireEngineLock(join(directory, "database-alias.sqlite"))).rejects.toThrow("Another Mimo Engine already owns this database")
  } finally {
    await lock.release()
  }

  const next = await acquireEngineLock(database)
  await next.release()
  await next.release()
})

test("killing the executor releases its lock without stale PID recovery", async () => {
  const database = join(directory, "new/mimo.sqlite")
  const worker = join(directory, "worker.ts")
  await Bun.write(worker, `
    import { acquireEngineLock } from ${JSON.stringify(resolve("src/engine/persistence/engine-lock.ts"))}
    const lock = await acquireEngineLock(Bun.argv[2])
    console.log("ready")
    for await (const chunk of Bun.stdin.stream()) {}
    await lock.release()
  `)
  const child = Bun.spawn([process.execPath, worker, database], { stdin: "pipe", stdout: "pipe", stderr: "pipe" })

  try {
    const reader = child.stdout.getReader()
    const message = await reader.read()
    reader.releaseLock()
    expect(new TextDecoder().decode(message.value).trim()).toBe("ready")
    await expect(acquireEngineLock(database)).rejects.toThrow("Another Mimo Engine already owns this database")
    child.kill("SIGKILL")
    await child.exited
    const released = Bun.spawn(["flock", "--wait", "2", "--", `${database}.lock`, "true"], { stdout: "ignore", stderr: "ignore" })
    expect(await released.exited).toBe(0)
    const lock = await acquireEngineLock(database)
    await lock.release()
  } finally {
    child.stdin.end()
    child.kill()
    await child.exited
  }
})
