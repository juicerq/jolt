import { expect, test } from "bun:test"
import { lstat, mkdir, readFile, rm, symlink } from "node:fs/promises"
import { join } from "node:path"
import { errorGit, verifyErrorCorrection } from "@src/engine/error-automation/verification"
import { testDirectory } from "./support/test-directory"

const directory = testDirectory("jolt-verification-boundary-")

test("verification preserves an existing env and refuses a dangling env symlink before creating services", async () => {
  await mkdir(join(directory, "apps/tests"), { recursive: true })
  await Bun.write(join(directory, "apps/tests/.env.test"), "NODE_ENV=test\n")
  await errorGit(directory, ["init"])
  await errorGit(directory, ["add", "."])
  await errorGit(directory, ["commit", "-m", "test fixture"])
  const env = join(directory, ".env")
  await Bun.write(env, "private-local-value")
  await expect(verifyErrorCorrection(directory, crypto.randomUUID())).rejects.toThrow("EEXIST")
  expect(await readFile(env, "utf8")).toBe("private-local-value")
  await rm(env)
  const outside = join(directory, "outside-target")
  await symlink(outside, env)
  await expect(verifyErrorCorrection(directory, crypto.randomUUID())).rejects.toThrow("EEXIST")
  expect(await Bun.file(outside).exists()).toBe(false)
  expect((await lstat(env)).isSymbolicLink()).toBe(true)
})
