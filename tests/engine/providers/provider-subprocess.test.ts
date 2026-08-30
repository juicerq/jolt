import { describe, expect, test } from "bun:test"
import { writeFile } from "node:fs/promises"
import { join } from "node:path"
import { runProviderCommand } from "@src/engine/providers/provider-subprocess"
import { testDirectory } from "../../support/test-directory"

const directory = testDirectory("jots-provider-")

describe("provider subprocess", () => {
  test("returns bounded output from a completed command", async () => {
    const result = await runProviderCommand(["bash", "-c", "printf 'ready'; printf 'warning' >&2"], 1_000)

    expect(result).toEqual({ exitCode: 0, stdout: "ready", stderr: "warning" })
  })

  test("times out and terminates the subprocess group", async () => {
    const pidPath = join(directory, "child.pid")

    await expect(runProviderCommand(["bash", "-c", `sleep 30 & printf '%s' $! > '${pidPath}'; wait`], 50)).rejects.toThrow("timed out")
    const pid = Number(await Bun.file(pidPath).text())
    await Bun.sleep(20)

    expect(() => process.kill(pid, 0)).toThrow()
  })

  test("terminates descendants after the parent exits", async () => {
    const pidPath = join(directory, "child.pid")

    await runProviderCommand(["bash", "-c", `sleep 30 </dev/null >/dev/null 2>&1 & printf '%s' $! > '${pidPath}'`], 1_000)
    const pid = Number(await Bun.file(pidPath).text())
    await Bun.sleep(20)

    expect(() => process.kill(pid, 0)).toThrow()
  })

  test("rejects output larger than the provider boundary", async () => {
    const scriptPath = join(directory, "output.sh")
    await writeFile(scriptPath, "#!/bin/sh\nhead -c 70000 /dev/zero | tr '\\0' x", { mode: 0o700 })

    await expect(runProviderCommand([scriptPath], 1_000)).rejects.toThrow("output limit")
  })
})
