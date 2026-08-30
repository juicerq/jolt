import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { runProviderCommand } from "./provider-subprocess"

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe("provider subprocess", () => {
  test("returns bounded output from a completed command", async () => {
    const result = await runProviderCommand(["bash", "-c", "printf 'ready'; printf 'warning' >&2"], 1_000)

    expect(result).toEqual({ exitCode: 0, stdout: "ready", stderr: "warning" })
  })

  test("times out and terminates the subprocess group", async () => {
    const directory = await mkdtemp(join(tmpdir(), "jots-provider-"))
    const pidPath = join(directory, "child.pid")
    directories.push(directory)

    await expect(runProviderCommand(["bash", "-c", `sleep 30 & printf '%s' $! > '${pidPath}'; wait`], 50)).rejects.toThrow("timed out")
    const pid = Number(await Bun.file(pidPath).text())
    await Bun.sleep(20)

    expect(() => process.kill(pid, 0)).toThrow()
  })

  test("terminates descendants after the parent exits", async () => {
    const directory = await mkdtemp(join(tmpdir(), "jots-provider-"))
    const pidPath = join(directory, "child.pid")
    directories.push(directory)

    await runProviderCommand(["bash", "-c", `sleep 30 </dev/null >/dev/null 2>&1 & printf '%s' $! > '${pidPath}'`], 1_000)
    const pid = Number(await Bun.file(pidPath).text())
    await Bun.sleep(20)

    expect(() => process.kill(pid, 0)).toThrow()
  })

  test("rejects output larger than the provider boundary", async () => {
    const directory = await mkdtemp(join(tmpdir(), "jots-provider-"))
    const scriptPath = join(directory, "output.sh")
    directories.push(directory)
    await writeFile(scriptPath, "#!/bin/sh\nhead -c 70000 /dev/zero | tr '\\0' x", { mode: 0o700 })

    await expect(runProviderCommand([scriptPath], 1_000)).rejects.toThrow("output limit")
  })
})
