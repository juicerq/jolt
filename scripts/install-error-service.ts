import { constants } from "node:fs"
import { access, mkdir, realpath, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { isAbsolute, join, resolve } from "node:path"
import { parseArgs } from "node:util"

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: { "user-data": { type: "string" }, "dry-run": { type: "boolean" }, install: { type: "boolean" }, enable: { type: "boolean" } },
  strict: true,
})
const userData = values["user-data"]

// Caracteres de controle no caminho corromperiam a unit do systemd, então são recusados antes de escrever.
function hasControlCharacters(value: string) {
  return value.split("").some((character) => character < " " || character === "\u007f")
}

if (!userData || !isAbsolute(userData) || hasControlCharacters(userData)
  || !!values["dry-run"] === !!values.install || (values.enable && !values.install)) {
  throw new Error("Usage: bun scripts/install-error-service.ts --user-data /absolute/path (--dry-run | --install [--enable])")
}

if (process.platform !== "linux") {
  throw new Error("The background service requires Linux and systemd --user")
}

const repository = await realpath(resolve(import.meta.dir, ".."))
const electron = join(repository, "node_modules/electron/dist/electron")

function quote(value: string) {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("%", "%%")}"`
}

const unit = `[Unit]
Description=Mimo Dogama error automation
After=graphical-session.target

[Service]
Type=simple
WorkingDirectory=${repository.replaceAll("%", "%%")}
ExecStart=${quote(electron).replaceAll("$", () => "$$")} ${quote(repository).replaceAll("$", () => "$$")} --background
Environment=${quote(`MIMO_USER_DATA=${resolve(userData)}`)}
Restart=on-failure
RestartSec=5
UMask=0077

[Install]
WantedBy=default.target
`

if (values["dry-run"]) {
  console.log(unit)
} else {
  await Promise.all([
    access(electron, constants.X_OK),
    access(join(repository, "dist-engine/mimo-engine"), constants.X_OK),
    ...["out/main/index.js", "out/renderer/index.html", "out/preload/index.cjs"].map((path) => access(join(repository, path), constants.R_OK)),
  ]).catch(() => { throw new Error("Build the current app with bun run build before installing its background service") })

  const systemctl = Bun.which("systemctl")

  if (!systemctl) {
    throw new Error("systemctl is required to install the background service")
  }

  const directory = join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "systemd/user")
  await mkdir(directory, { recursive: true, mode: 0o700 })
  await writeFile(join(directory, "mimo-errors.service"), unit, { mode: 0o600 })
  const reload = Bun.spawn([systemctl, "--user", "daemon-reload"], { stdout: "inherit", stderr: "inherit" })

  if (await reload.exited !== 0) {
    throw new Error("Service file written, but systemd --user daemon-reload failed")
  }

  if (values.enable) {
    const enable = Bun.spawn([systemctl, "--user", "enable", "--now", "mimo-errors.service"], { stdout: "inherit", stderr: "inherit" })

    if (await enable.exited !== 0) {
      throw new Error("Service installed, but systemd could not enable and start it")
    }
  }

  console.log(values.enable ? "Mimo error service installed and enabled." : "Mimo error service installed. It has not been enabled or started.")
}
