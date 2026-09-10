import assert from "node:assert/strict"
import { chmod, mkdir, rm, symlink, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join, relative } from "node:path"
import { app, clipboard } from "electron"
import { actOnLocalFile, resolveLocalFile } from "@src/main/local-files"

async function verify() {
  const directory = process.argv.at(-1)

  assert.ok(directory)
  app.setPath("userData", join(directory, "electron"))
  await app.whenReady()

  const reports = join(directory, "relatorios")
  const path = join(reports, "2026-09-10.md")
  const folder = join(directory, "pasta.md")
  const link = join(directory, "atalho.md")

  await mkdir(reports)
  await mkdir(folder)
  await writeFile(path, "Relatório de teste")
  await symlink(path, link)

  assert.equal(await resolveLocalFile({ path }), path)
  assert.equal(await resolveLocalFile({ path: "relatorios/2026-09-10.md", directory }), path)
  assert.equal(await resolveLocalFile({ path: "2026-09-10.md", directory: reports }), path)
  assert.equal(await resolveLocalFile({ path: `~/${relative(homedir(), path)}` }), path)
  assert.equal(await resolveLocalFile({ path: link }), link)

  assert.equal(await resolveLocalFile({ path: "relatorios/2026-09-10.md" }), null)
  assert.equal(await resolveLocalFile({ path: "relatorios/2026-09-10.md", directory: "relative" }), null)
  assert.equal(await resolveLocalFile({ path: "fontes.md", directory }), null)
  assert.equal(await resolveLocalFile({ path: "relatorios/2026-09-10.md", directory: reports }), null)
  assert.equal(await resolveLocalFile({ path: join(directory, "ausente.md") }), null)
  assert.equal(await resolveLocalFile({ path: folder }), null)

  await actOnLocalFile({ action: "copy-path", path: "relatorios/2026-09-10.md", directory })
  assert.equal(await clipboard.readText(), path)

  await chmod(path, 0)
  assert.equal(await resolveLocalFile({ path }), null)
  await chmod(path, 0o600)
  assert.equal(await resolveLocalFile({ path }), path)

  await rm(path)
  assert.equal(await resolveLocalFile({ path }), null)
  assert.equal(await resolveLocalFile({ path: link }), null)

  const error = await actOnLocalFile({ action: "open", path }).then(() => null, (error: unknown) => error)
  assert.ok(error instanceof Error)

  console.log("Local file checks passed")
}

void verify().then(() => app.quit(), (error) => {
  console.error(error)
  app.exit(1)
})
