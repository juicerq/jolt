import { expect, test } from "bun:test"
import { join } from "node:path"
import { testDirectory } from "./support/test-directory"

const directory = testDirectory("mimo-local-files-")

test("only resolves readable files and uses the same location for desktop actions", async () => {
  const build = await Bun.build({ entrypoints: [join(import.meta.dir, "support/local-files-electron.ts")], target: "node", format: "esm", external: ["electron"], outdir: directory, naming: "verify.mjs" })

  expect(build.success).toBe(true)

  const process = Bun.spawn([join(import.meta.dir, "../node_modules/.bin/electron"), "--ozone-platform=headless", "--disable-gpu", join(directory, "verify.mjs"), directory], { stdout: "pipe", stderr: "pipe" })
  const [code, stdout, stderr] = await Promise.all([process.exited, new Response(process.stdout).text(), new Response(process.stderr).text()])

  expect({ code, output: code === 0 ? stdout.trim() : stderr }).toEqual({ code: 0, output: "Local file checks passed" })
}, 30_000)
