import { existsSync } from "node:fs"
import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises"
import { basename, extname, join, resolve } from "node:path"
import { env } from "node:process"

const outputLimit = 64 * 1024
const technicalExtensions = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".jsonc", ".sql",
  ".css", ".scss", ".html", ".md", ".yaml", ".yml", ".toml", ".sh", ".lock",
  ".graphql", ".prisma", ".py", ".rs", ".go",
])

function isCredentialPath(path: string) {
  return path.split("/").some((part) =>
    /^(?:\.env(?:\..*)?|\.npmrc|\.netrc|\.ssh|\.aws|\.gnupg|credentials(?:\..*)?|secrets?(?:\.(?:json|ya?ml|toml))?|service[-_]account.*\.json|id_(?:rsa|ed25519|ecdsa))$/i.test(part),
  ) || /\.(?:pem|key|p12|pfx|keystore)$/i.test(path)
}

async function boundedText(stream: ReadableStream<Uint8Array>) {
  const chunks: Uint8Array[] = []
  let length = 0

  for await (const chunk of stream) {
    const remaining = outputLimit - length

    if (remaining > 0) {
      const slice = chunk.subarray(0, remaining)
      chunks.push(slice)
      length += slice.length
    }
  }

  return Buffer.concat(chunks).toString("utf8")
}

async function git(directory: string, args: string[]) {
  const process = Bun.spawn(["git", "-C", directory, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...env, GIT_TERMINAL_PROMPT: "0" },
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(), boundedText(process.stderr), process.exited,
  ])

  if (exitCode !== 0) {
    throw new Error(`Error automation git ${args[0]} failed: ${stderr.trim()}`)
  }

  return stdout.trimEnd()
}

async function trackedFiles(directory: string, commit: string) {
  const tree = await git(directory, ["ls-tree", "-rz", "--full-tree", commit])

  return tree.split("\0").filter(Boolean).map((entry) => {
    const tab = entry.indexOf("\t")
    return { mode: entry.slice(0, 6), path: entry.slice(tab + 1) }
  })
}

export function createErrorWorkspace(options: { repositoryDirectory: string; rootDirectory: string }) {
  const repositoryDirectory = resolve(options.repositoryDirectory)
  const rootDirectory = resolve(options.rootDirectory)
  const managedRepository = join(rootDirectory, "repository.git")

  async function prepareRepository() {
    await mkdir(rootDirectory, { recursive: true })
    const origin = await git(repositoryDirectory, ["remote", "get-url", "origin"])

    if (/^https?:\/\/[^/]*@/i.test(origin)) {
      throw new Error("Repository origin must use a credential helper instead of embedded credentials")
  }

  if (!existsSync(managedRepository)) {
    await git(rootDirectory, ["init", "--bare", managedRepository])
    await git(managedRepository, ["remote", "add", "origin", origin])
  }

  if (await git(managedRepository, ["remote", "get-url", "origin"]) !== origin) {
    throw new Error("Error workspace belongs to a different repository")
  }

  }

  return {
    async mirror(revision = "HEAD") {
      await mkdir(rootDirectory, { recursive: true })
      const localCommit = await git(repositoryDirectory, ["rev-parse", "--verify", "--end-of-options", `${revision}^{commit}`]).catch(() => undefined)
      const sourceRepository = localCommit ? repositoryDirectory : managedRepository
      if (!localCommit) {
        if (!/^[a-f0-9]{40}$/.test(revision)) {
          throw new Error("The investigated revision must be an available commit")
        }
        await prepareRepository()
        await git(managedRepository, ["fetch", "--no-tags", "origin", revision])
      }
      const commit = localCommit ?? await git(managedRepository, ["rev-parse", "--verify", `${revision}^{commit}`])
      const files = (await trackedFiles(sourceRepository, commit)).filter(({ mode, path }) =>
        (mode === "100644" || mode === "100755")
        && !path.split("/").some((part) => part.startsWith("."))
        && !isCredentialPath(path)
        && (technicalExtensions.has(extname(path)) || ["Dockerfile", "Makefile"].includes(basename(path))),
      )
      const container = await mkdtemp(join(rootDirectory, `mirror-${commit.slice(0, 12)}-`))
      const directory = join(container, "source")
      const archive = join(container, "source.tar")
      const manifest = join(container, "files")
      await mkdir(directory)

      try {
        if (files.length) {
          await git(sourceRepository, ["archive", "--format=tar", `--output=${archive}`, commit])
          await Bun.write(manifest, `${files.map((file) => file.path).join("\0")}\0`)
          const extraction = Bun.spawn([
            "tar", "-xf", archive, "-C", directory, "--no-same-owner", "--no-same-permissions",
            "--null", "--verbatim-files-from", "--no-recursion", "-T", manifest,
          ], { stdout: "ignore", stderr: "pipe" })
          const [error, exitCode] = await Promise.all([boundedText(extraction.stderr), extraction.exited])

          if (exitCode !== 0) {
            throw new Error(`Error automation mirror extraction failed: ${error}`)
          }
        }

        return { directory, commit }
      } catch (error) {
        await rm(container, { recursive: true, force: true })
        throw error
      } finally {
        await rm(archive, { force: true })
        await rm(manifest, { force: true })
      }
    },

    async provision(issueNumber: number, generation?: string) {
      if (!Number.isSafeInteger(issueNumber) || issueNumber <= 0) {
        throw new Error("An error workspace requires a positive issue number")
      }

      if (generation !== undefined && !/^[a-f0-9]{12}$/.test(generation)) {
        throw new Error("Invalid correction context identity")
      }

      await prepareRepository()
      await git(managedRepository, ["fetch", "--no-tags", "origin", "+refs/heads/dev:refs/remotes/origin/dev"])
      const suffix = generation ? `-${generation}` : ""
      const branch = `mimo/error-${issueNumber}${suffix}`
      const directory = join(rootDirectory, `error-${issueNumber}${suffix}`)

      if (!existsSync(directory)) {
        const existingBranch = await git(managedRepository, ["branch", "--list", branch])

        if (existingBranch) {
          await git(managedRepository, ["worktree", "add", directory, branch])
        } else {
          await git(managedRepository, ["worktree", "add", "-b", branch, directory, "refs/remotes/origin/dev"])
        }
      }

      const commonDirectory = await git(directory, ["rev-parse", "--path-format=absolute", "--git-common-dir"])

      if (await realpath(commonDirectory) !== await realpath(managedRepository)
        || await git(directory, ["branch", "--show-current"]) !== branch) {
        throw new Error("Refusing to reuse an unrelated error workspace")
      }

      const commit = await git(directory, ["rev-parse", "HEAD"])

      if ((await trackedFiles(directory, commit)).some((file) =>
        isCredentialPath(file.path) && file.path !== "apps/tests/.env.test" && !/^\.env\.(?:example|sample|template)$/.test(basename(file.path)),
      )) {
        throw new Error("Repository tracks credential files; remove them before running an error corrector")
      }

      return { directory, branch, commit }
    },
  }
}

export async function sandboxedBash(directory: string, command: string, signal?: AbortSignal) {
  const bwrap = Bun.which("bwrap")
  const bun = Bun.which("bun")

  if (!bwrap || !bun) {
    throw new Error("Error automation requires bubblewrap and Bun; refusing an unsandboxed shell")
  }

  const workspace = await realpath(directory)
  const credentialMounts: string[] = []

  for await (const path of new Bun.Glob("**/*").scan({ cwd: workspace, dot: true, onlyFiles: true, followSymlinks: false })) {
    if (isCredentialPath(path)) {
      credentialMounts.push("--ro-bind", "/dev/null", `/workspace/${path}`)
    }
  }

  const mounts = ["/usr", "/bin", "/lib", "/lib64"]
    .filter((path) => existsSync(path)).flatMap((path) => ["--ro-bind", path, path])
  const process = Bun.spawn([
    bwrap, "--die-with-parent", "--new-session", "--unshare-all", "--clearenv",
    ...mounts, "--proc", "/proc", "--dev", "/dev", "--tmpfs", "/tmp",
    "--dir", "/tools", "--ro-bind", await realpath(bun), "/tools/bun",
    "--symlink", "bun", "/tools/node", "--bind", workspace, "/workspace",
    ...(existsSync(join(workspace, ".git")) ? ["--ro-bind", "/dev/null", "/workspace/.git"] : []),
    ...credentialMounts,
    "--setenv", "PATH", "/tools:/usr/bin:/bin", "--setenv", "HOME", "/tmp",
    "--setenv", "TMPDIR", "/tmp", "--setenv", "LANG", "C.UTF-8",
    "--chdir", "/workspace", "--", "/bin/bash", "--noprofile", "--norc", "-c", command,
  ], {
    env: {}, stdout: "pipe", stderr: "pipe", timeout: 120_000,
    ...(signal ? { signal } : {}),
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    boundedText(process.stdout), boundedText(process.stderr), process.exited,
  ])

  return { stdout: `${stdout}${stderr}`.slice(0, outputLimit), exitCode }
}

export async function assertDogamaRepository(directory: string) {
  for (const args of [["remote", "get-url", "--all", "origin"], ["remote", "get-url", "--push", "--all", "origin"]]) {
    const origins = (await git(directory, args)).split("\n")
    const origin = origins.length === 1 ? origins[0] : undefined
    if (!origin || !/^(?:git@github\.com:|ssh:\/\/git@github\.com\/|https:\/\/github\.com\/)dogama-erp\/app(?:\.git)?\/?$/.test(origin)) {
      throw new Error("The correction repository origin must be dogama-erp/app on github.com")
    }
  }
}

export async function assertErrorCorrectionFiles(directory: string) {
  const changed = await git(directory, ["diff", "--name-only", "-z", "origin/dev"])
  const added = await git(directory, ["ls-files", "--others", "--exclude-standard", "-z"])

  if (`${changed}\0${added}`.split("\0").some((path) => /(^|\/)(?:\.github|\.gitattributes|\.gitmodules)(\/|$)/i.test(path))) {
    throw new Error("Automated corrections cannot publish GitHub workflows, actions or Git configuration files")
  }
}
