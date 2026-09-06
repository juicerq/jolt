import { expect, test } from "bun:test"
import { mkdir, readFile, symlink } from "node:fs/promises"
import { join } from "node:path"
import { assertDogamaRepository, assertErrorCorrectionFiles, createErrorWorkspace, sandboxedBash } from "@src/engine/error-automation/workspace"
import { rejects } from "./support/expect"
import { testDirectory } from "./support/test-directory"

const root = testDirectory("mimo-error-workspace-")

async function git(directory: string, ...args: string[]) {
  const process = Bun.spawn(["git", "-C", directory, ...args], { stdout: "pipe", stderr: "pipe" })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(), new Response(process.stderr).text(), process.exited,
  ])

  if (exitCode !== 0) {
    throw new Error(stderr)
  }

  return stdout.trim()
}

async function repository() {
  const directory = join(root, "personal")
  await mkdir(directory)
  await git(directory, "init", "-b", "dev")
  await git(directory, "config", "user.email", "test@example.invalid")
  await git(directory, "config", "user.name", "Test")
  await Bun.write(join(directory, "index.ts"), "export const value = 1\n")
  await git(directory, "add", ".")
  await git(directory, "commit", "-m", "initial")
  await git(directory, "remote", "add", "origin", directory)
  return directory
}

test("publication refuses another remote and privileged files even after staging or committing", async () => {
  const directory = await repository()
  await rejects(assertDogamaRepository(directory), "dogama-erp/app")
  await git(directory, "remote", "set-url", "origin", "git@github.com:dogama-erp/app.git")
  await assertDogamaRepository(directory)
  await git(directory, "config", "remote.origin.pushurl", "git@github.com:someone/other.git")
  await rejects(assertDogamaRepository(directory), "dogama-erp/app")
  await git(directory, "config", "--unset", "remote.origin.pushurl")
  await git(directory, "update-ref", "refs/remotes/origin/dev", "HEAD")
  await Bun.write(join(directory, "index.ts"), "export const value = 2\n")
  await assertErrorCorrectionFiles(directory)
  await mkdir(join(directory, ".github/workflows"), { recursive: true })
  await Bun.write(join(directory, ".github/workflows/injected.yml"), "on: push\n")
  await rejects(assertErrorCorrectionFiles(directory), "workflows")
  await git(directory, "add", "--all")
  await rejects(assertErrorCorrectionFiles(directory), "workflows")
  await git(directory, "commit", "-m", "untrusted change")
  await rejects(assertErrorCorrectionFiles(directory), "workflows")
})

test("a newly deployed commit is fetched into the managed repository without changing the personal checkout", async () => {
  const directory = await repository()
  const remote = join(root, "remote")
  await git(root, "clone", directory, remote)
  await git(remote, "config", "user.email", "test@example.invalid")
  await git(remote, "config", "user.name", "Test")
  await Bun.write(join(remote, "index.ts"), "export const value = 3\n")
  await git(remote, "commit", "-am", "deployed change")
  const commit = await git(remote, "rev-parse", "HEAD")
  await git(directory, "remote", "set-url", "origin", remote)
  await Bun.write(join(directory, "index.ts"), "personal edit\n")
  const mirror = await createErrorWorkspace({ repositoryDirectory: directory, rootDirectory: join(root, "managed") }).mirror(commit)
  expect(mirror.commit).toBe(commit)
  expect(await readFile(join(mirror.directory, "index.ts"), "utf8")).toBe("export const value = 3\n")
  expect(await readFile(join(directory, "index.ts"), "utf8")).toBe("personal edit\n")
  await rejects(git(directory, "cat-file", "-e", commit))
})

test("mirror exports the confirmed commit without local edits, credential files or symlinks", async () => {
  const directory = await repository()
  await Bun.write(join(directory, ".env"), "PRODUCTION_TOKEN=secret")
  await Bun.write(join(directory, "credentials.json"), '{"token":"secret"}')
  await symlink("/etc/passwd", join(directory, "leak.ts"))
  await git(directory, "add", ".")
  await git(directory, "commit", "-m", "sensitive tracked fixtures")
  const commit = await git(directory, "rev-parse", "HEAD")
  await Bun.write(join(directory, "index.ts"), "personal uncommitted change")
  const workspace = createErrorWorkspace({ repositoryDirectory: directory, rootDirectory: join(root, "automation") })
  const mirror = await workspace.mirror(commit)

  expect(mirror.commit).toBe(commit)
  expect(await readFile(join(mirror.directory, "index.ts"), "utf8")).toBe("export const value = 1\n")
  expect(await Array.fromAsync(new Bun.Glob("**/*").scan({ cwd: mirror.directory, dot: true }))).toEqual(["index.ts"])
  await rejects(workspace.mirror("--output=/tmp/injected"), "must be an available commit")
})

test("provision uses updated origin/dev and preserves both personal and existing corrective edits", async () => {
  const directory = await repository()
  const workspace = createErrorWorkspace({ repositoryDirectory: directory, rootDirectory: join(root, "automation") })
  const first = await workspace.provision(42)
  await Bun.write(join(first.directory, "index.ts"), "corrector work")
  await Bun.write(join(directory, "index.ts"), "export const value = 2\n")
  await git(directory, "add", ".")
  await git(directory, "commit", "-m", "new dev")
  const updated = await git(directory, "rev-parse", "HEAD")
  await Bun.write(join(directory, "personal.txt"), "keep me")
  const repeat = await workspace.provision(42)
  const next = await workspace.provision(43)

  expect(repeat).toEqual(first)
  expect(next.commit).toBe(updated)
  expect(first.branch).toBe("mimo/error-42")
  expect(await readFile(join(first.directory, "index.ts"), "utf8")).toBe("corrector work")
  expect(await git(directory, "branch", "--show-current")).toBe("dev")
  expect(await readFile(join(directory, "personal.txt"), "utf8")).toBe("keep me")
  expect(await git(directory, "worktree", "list", "--porcelain")).not.toContain(first.directory)
})

test("sandbox runs Bun with workspace-only writes, no host secrets, credentials, git metadata or network", async () => {
  const directory = await repository()
  const workspace = createErrorWorkspace({ repositoryDirectory: directory, rootDirectory: join(root, "automation") })
  const corrective = await workspace.provision(7)
  const secret = join(root, "host-secret")
  await Bun.write(secret, "private host data")
  await Bun.write(join(corrective.directory, ".env"), "SECRET=host-install-token")
  await symlink(secret, join(corrective.directory, "escape"))
  const result = await sandboxedBash(corrective.directory, `
    set -eu
    test ! -r '${secret}'
    test ! -r /workspace/escape
    test ! -e /var/run/docker.sock
    test ! -s /workspace/.git
    test ! -s /workspace/.env
    test -z "$(env | sed -n '/TOKEN\\|SECRET\\|AWS_\\|SSH_AUTH/p')"
    test ! -e /home/pedro
    if touch /usr/forbidden 2>/dev/null; then exit 11; fi
    if (echo hello >/dev/tcp/1.1.1.1/443) 2>/dev/null; then exit 12; fi
    bun -e 'await Bun.write("result.txt", "sandbox works")'
    cat result.txt
  `)

  expect(result).toEqual({ stdout: "sandbox works", exitCode: 0 })
  expect(await readFile(join(corrective.directory, "result.txt"), "utf8")).toBe("sandbox works")
  expect(await readFile(secret, "utf8")).toBe("private host data")
})
