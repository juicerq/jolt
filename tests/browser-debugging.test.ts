import { expect, test } from "bun:test"
import { join } from "node:path"
import { testDirectory } from "./support/test-directory"

const directory = testDirectory("mimo-browser-debugging-")

test("browser control works on a fallback port when the development port is occupied", async () => {
  const script = join(directory, "verify.mjs")
  const build = await Bun.build({ entrypoints: [join(import.meta.dir, "support/browser-debugging-electron.ts")], target: "node", format: "esm", external: ["electron"], outdir: directory, naming: "verify.mjs" })

  expect(build.success).toBe(true)

  const process = Bun.spawn([join(import.meta.dir, "../node_modules/.bin/electron"), "--ozone-platform=headless", "--disable-gpu", script, directory, join(import.meta.dir, "..")], { stdout: "pipe", stderr: "pipe" })
  const [code, stdout, stderr] = await Promise.all([process.exited, new Response(process.stdout).text(), new Response(process.stderr).text()])

  expect({ code, output: code === 0 ? stdout.trim() : stderr }).toEqual({ code: 0, output: "Browser fallback checks passed" })
}, 30_000)
