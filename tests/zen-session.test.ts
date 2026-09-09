import { expect, test } from "bun:test"
import { join } from "node:path"
import { testDirectory } from "./support/test-directory"

const directory = testDirectory("mimo-zen-session-")

test("Zen sessions import into real Electron cookies without mixing accounts", async () => {
  const script = join(directory, "verify.cjs")
  const build = await Bun.build({ entrypoints: [join(import.meta.dir, "support/zen-session-electron.ts")], target: "node", format: "cjs", external: ["electron"], outdir: directory, naming: "verify.cjs" })

  expect(build.success).toBe(true)

  const process = Bun.spawn([join(import.meta.dir, "../node_modules/.bin/electron"), "--ozone-platform=headless", "--disable-gpu", script, directory], { stdout: "pipe", stderr: "pipe" })
  const [code, stdout, stderr] = await Promise.all([process.exited, new Response(process.stdout).text(), new Response(process.stderr).text()])

  expect({ code, output: code === 0 ? stdout.trim() : stderr }).toEqual({ code: 0, output: "Zen session checks passed" })
}, 30_000)
