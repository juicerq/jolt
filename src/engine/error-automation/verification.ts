import { constants } from "node:fs"
import { link, lstat, mkdir, open, readFile, readdir, realpath, rm } from "node:fs/promises"
import { dirname, join } from "node:path"
import { parseEnv } from "node:util"

const runnerImage = "jolt-error-checks:bun1.3.14-node24.16.0-gs-v1"
const runnerDockerfile = "FROM imbios/bun-node:1.3.14-24.16.0-slim\nRUN apt-get update && apt-get install -y --no-install-recommends ghostscript && rm -rf /var/lib/apt/lists/*\n"
const runIdentity = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
const preparePrisma = `
const { dirname, resolve, relative } = await import("node:path");
const { mkdir, symlink, realpath } = await import("node:fs/promises");
const source = resolve("apps/api/node_modules/@lobomfz/prismark");
const target = resolve("node_modules/@lobomfz/prismark");
if (await Bun.file(source + "/package.json").exists() && !await Bun.file(target + "/package.json").exists()) {
  await mkdir(dirname(target), {recursive:true});
  await symlink(relative(dirname(target), source), target, "dir");
}
const binary = resolve("node_modules/.bin/prismark");
if (await Bun.file(source + "/dist/cli.js").exists() && !await Bun.file(binary).exists()) {
  await mkdir(dirname(binary), {recursive:true});
  await symlink(relative(dirname(binary), source + "/dist/cli.js"), binary);
}
for await (const path of new Bun.Glob("node_modules/**/@prisma/engines/package.json").scan({dot:true})) {
  const directory = await realpath(dirname(path));
  const { download, BinaryType } = await import(Bun.resolveSync("@prisma/fetch-engine", directory));
  const { enginesVersion } = await import(Bun.resolveSync("@prisma/engines-version", directory));
  const binaries = { [BinaryType.SchemaEngineBinary]: directory };
  if (BinaryType.QueryEngineLibrary) binaries[BinaryType.QueryEngineLibrary] = directory;
  await download({ binaries, version: enginesVersion, showProgress: false });
}`

async function tail(stream: ReadableStream<Uint8Array>) {
  const decoder = new TextDecoder()
  let output = ""

  for await (const chunk of stream) {
    output = (output + decoder.decode(chunk, { stream: true })).slice(-30_000)
  }

  return (output + decoder.decode()).slice(-30_000)
}

async function command(args: string[], cwd: string, signal?: AbortSignal, timeout = 900_000, input?: string) {
  signal?.throwIfAborted()
  const child = Bun.spawn(args, { cwd, stdin: input ? new Blob([input]) : "ignore", stdout: "pipe", stderr: "pipe", timeout, killSignal: "SIGKILL" })
  const abort = () => child.kill("SIGKILL")
  signal?.addEventListener("abort", abort, { once: true })

  try {
    if (signal?.aborted) {
      abort()
    }

    const [stdout, stderr, exitCode] = await Promise.all([tail(child.stdout), tail(child.stderr), child.exited])
    signal?.throwIfAborted()
    const output = `${stdout}\n${stderr}`.trim()

    if (exitCode !== 0) {
      throw new Error(`${args[0]} ${args[1]} exited ${exitCode}: ${output}`)
    }

    return output
  } finally {
    signal?.removeEventListener("abort", abort)
  }
}

async function workspaceMounts(directory: string) {
  const metadata = await lstat(join(directory, ".git"))

  return [
    "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--read-only", "--tmpfs", "/tmp:rw,exec",
    "--user", `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`,
    "--mount", `type=bind,src=${directory},dst=/workspace`,
    "--mount", metadata.isDirectory()
      ? "type=tmpfs,dst=/workspace/.git,tmpfs-mode=0555,readonly"
      : "type=bind,src=/dev/null,dst=/workspace/.git,readonly",
    "--workdir", "/workspace", "--env", "HOME=/tmp", "--env", "BUN_INSTALL_CACHE_DIR=/tmp/bun-cache",
    "--env", "PATH=/workspace/apps/api/node_modules/.bin:/workspace/node_modules/.bin:/usr/local/bin:/usr/bin:/bin",
  ]
}

export async function errorGit(directory: string, args: string[]) {
  return await command(["git", "-c", "core.hooksPath=/dev/null", "-c", "user.name=Jolt", "-c", "user.email=jolt@localhost", ...args], directory)
}

export async function prepareErrorDependencies(directory: string, signal?: AbortSignal) {
  const workspace = await realpath(directory)
  const container = `jolt-install-${crypto.randomUUID()}`

  await command(["docker", "image", "inspect", runnerImage], workspace, signal, 30_000).catch(async () => {
    await command(["docker", "build", "--tag", runnerImage, "-"], workspace, signal, 900_000, runnerDockerfile)
  })

  try {
    await command([
      "docker", "run", "--rm", "--name", container, "--label", `jolt.error-workspaces=${dirname(workspace)}`, ...await workspaceMounts(workspace),
      runnerImage, "sh", "-c", `bun install --frozen-lockfile --ignore-scripts && bun -e '${preparePrisma}'`,
    ], workspace, signal)
  } finally {
    await command(["docker", "rm", "-f", container], workspace, undefined, 30_000).catch(() => {})
  }
}

export async function cleanupErrorChecks(workspacesRoot: string) {
  await mkdir(workspacesRoot, { recursive: true })
  const root = await realpath(workspacesRoot)
  const filter = `label=jolt.error-workspaces=${root}`
  const containers = (await command(["docker", "ps", "-aq", "--filter", filter], root, undefined, 30_000)).split("\n").filter(Boolean)

  if (containers.length) {
    await command(["docker", "rm", "-f", ...containers], root, undefined, 30_000)
  }

  const networks = (await command(["docker", "network", "ls", "-q", "--filter", filter], root, undefined, 30_000)).split("\n").filter(Boolean)

  if (networks.length) {
    await command(["docker", "network", "rm", ...networks], root, undefined, 30_000)
  }

  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^error-[1-9]\d*(?:-[a-f0-9]{12})?$/.test(entry.name)) {
      continue
    }

    const directory = join(root, entry.name)

    for (const file of await readdir(directory, { withFileTypes: true })) {
      if (!file.isFile()) {
        continue
      }

      const path = join(directory, file.name)
      const temporaryRun = file.name.match(/^\.jolt-check-(.+)\.env\.tmp$/)?.[1]

      if (temporaryRun && runIdentity.test(temporaryRun)) {
        await rm(path)
      } else if (file.name === ".env" && (await lstat(path)).size < 200_000) {
        const values = parseEnv(await readFile(path, "utf8"))

        if (values.NODE_ENV === "test" && runIdentity.test(values.JOLT_ERROR_CHECK_RUN_ID ?? "")) {
          await rm(path)
        }
      }
    }
  }
}

export async function verifyErrorCorrection(directory: string, runId: string, signal?: AbortSignal) {
  if (!runIdentity.test(runId)) {
    throw new Error("Invalid correction run identity")
  }

  signal?.throwIfAborted()
  const workspace = await realpath(directory)
  const prefix = `jolt-check-${runId}`
  const [frontChanges, toolsChanges] = await Promise.all([
    errorGit(workspace, ["status", "--porcelain", "--untracked-files=all", "--", "apps/front"]),
    errorGit(workspace, ["status", "--porcelain", "--untracked-files=all", "--", "apps/tools"]),
  ])
  const affectedChecks = [
    ...(frontChanges ? ["cd /workspace/apps/front && bunx --no-install tsr generate && bun astro sync && bun tsgo && bun check:astro"] : []),
    ...(toolsChanges ? ["cd /workspace/apps/tools && bun tsgo"] : []),
  ]
  const resourceLabel = `jolt.error-workspaces=${dirname(workspace)}`
  const containers: string[] = []
  const fixture = parseEnv(await errorGit(workspace, ["show", "HEAD:apps/tests/.env.test"]))
  const environment = {
    ...fixture,
    NODE_ENV: "test",
    JOLT_ERROR_CHECK_RUN_ID: runId,
    NEW_DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/dogama_test",
    DIRECT_URL: "postgresql://postgres:postgres@localhost:5432/dogama_test",
    TYPESENSE_HOST: "typesense", TYPESENSE_API_KEY: "123",
    REDIS_URL: "redis://redis:6379", REDIS_HOST: "redis", REDIS_PORT: "6379", REDIS_PASSWORD: "",
    AWS_ENDPOINT: "http://minio:9000", AWS_PATH: "http://minio:9000/dogama-test", PRODUCT_IMAGE_AWS_PATH: "http://minio:9000/dogama-test",
    AWS_ACCESS_KEY_ID: "minioadmin", AWS_SECRET_ACCESS_KEY: "minioadmin", AWS_BUCKET_NAME: "dogama-test",
    PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION: "yes",
  }
  const envFile = join(workspace, ".env")
  const temporaryEnv = join(workspace, `.jolt-check-${runId}.env.tmp`)
  const envHandle = await open(temporaryEnv, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
  let envPublished = false

  async function start(name: string, image: string, args: string[], afterImage: string[] = []) {
    const container = `${prefix}-${name}`
    containers.push(container)
    await command(["docker", "run", "-d", "--name", container, "--label", resourceLabel, "--network", prefix, "--network-alias", name, ...args, image, ...afterImage], workspace, signal)
    return container
  }

  try {
    await envHandle.writeFile(Object.entries(environment).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join("\n"))
    await envHandle.close()
    // link publishes complete content atomically and refuses existing files and dangling symlinks.
    await link(temporaryEnv, envFile)
    envPublished = true
    await rm(temporaryEnv)
    await command(["docker", "network", "create", "--internal", "--label", resourceLabel, "--opt", "com.docker.network.bridge.gateway_mode_ipv4=isolated", prefix], workspace, signal)
    const postgres = await start("postgres_test", "postgres:17", ["-e", "POSTGRES_PASSWORD=postgres", "-e", "POSTGRES_DB=dogama_test"])
    await start("redis", "redis:7-alpine", [])
    await start("typesense", "typesense/typesense:28.0", ["-e", "TYPESENSE_API_KEY=123", "-e", "TYPESENSE_DATA_DIR=/tmp", "-e", "TYPESENSE_API_PORT=8109"])
    await start("minio", "minio/minio:latest", ["-e", "MINIO_ROOT_USER=minioadmin", "-e", "MINIO_ROOT_PASSWORD=minioadmin"], ["server", "/data"])
    await command(["docker", "exec", postgres, "sh", "-c", "until pg_isready -h 127.0.0.1 -U postgres -d dogama_test; do sleep 1; done"], workspace, signal)
    const bucketSetup = `${prefix}-bucket`
    containers.push(bucketSetup)
    await command(["docker", "run", "--rm", "--name", bucketSetup, "--label", resourceLabel, "--network", prefix, "--entrypoint", "/bin/sh", "minio/mc:latest", "-c", "until mc alias set local http://minio:9000 minioadmin minioadmin && mc mb --ignore-existing local/dogama-test; do sleep 1; done"], workspace, signal)
    const runner = `${prefix}-runner`
    containers.push(runner)
    const output = await command([
      "docker", "run", "--rm", "--name", runner, "--label", resourceLabel, "--network", `container:${postgres}`, ...await workspaceMounts(workspace),
      ...Object.entries(environment).flatMap(([key, value]) => ["--env", `${key}=${value}`]),
      runnerImage, "sh", "-c",
      ["bun -e 'const deadline = Date.now() + 60000; while (!(await fetch(\"http://typesense:8109/health\").then(r => r.json()).catch(() => ({ok:false}))).ok) { if (Date.now() >= deadline) throw new Error(\"Typesense did not become ready\"); await Bun.sleep(250) }' && bun run --cwd apps/api check:api && cd apps/tests && bun test", ...affectedChecks].join(" && "),
    ], workspace, signal)
    await errorGit(workspace, ["diff", "--check"])
    return output
  } finally {
    await envHandle.close()

    for (const container of containers.reverse()) {
      await command(["docker", "rm", "-f", container], workspace, undefined, 30_000).catch(() => {})
    }

    await command(["docker", "network", "rm", prefix], workspace, undefined, 30_000).catch(() => {})
    await rm(temporaryEnv, { force: true })

    if (envPublished) {
      await rm(envFile, { force: true })
    }
  }
}
