import assert from "node:assert/strict"
import { mkdir, writeFile } from "node:fs/promises"
import { createServer } from "node:http"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { app, session, WebContentsView } from "electron"
import { importZenSession } from "@src/main/browser/zen-session"

async function verify() {
  const directory = process.argv.at(-1)
  assert.ok(directory)
  const profile = join(directory, "zen", "release")
  app.setPath("userData", join(directory, "electron"))
  process.env.XDG_CONFIG_HOME = directory
  delete process.env.MIMO_ZEN_PROFILE
  delete process.env.MIMO_ZEN_CONTAINER
  await mkdir(profile, { recursive: true })
  await writeFile(join(directory, "zen", "profiles.ini"), "[Profile0]\nPath=unused\nDefault=1\n\n[InstallABC]\nDefault=release\n")
  const database = new DatabaseSync(join(profile, "cookies.sqlite"))
  database.exec("PRAGMA journal_mode=WAL; CREATE TABLE moz_cookies (originAttributes TEXT, name TEXT, value TEXT, host TEXT, path TEXT, expiry INTEGER, isSecure INTEGER, isHttpOnly INTEGER, sameSite INTEGER)")
  const insert = database.prepare("INSERT INTO moz_cookies VALUES (?, ?, ?, ?, '/', ?, ?, 1, ?)")
  const future = Math.floor(Date.now() / 1000) + 3600
  insert.run("^userContextId=2", "__Host-auth", "zen", "example.test", future, 1, 2)
  insert.run("^userContextId=2", "domain", "zen", ".example.test", future, 1, 0)
  insert.run("^userContextId=2", "expired", "old", "example.test", 1, 1, 1)
  insert.run("^userContextId=2&partitionKey=%28https%2Cexample.test%29", "partitioned", "private", "example.test", future, 1, 1)
  insert.run("", "default", "different-account", "example.test", future, 1, 1)
  insert.run("^userContextId=2", "auth", "other-account", "existing.test", future, 1, 1)
  insert.run("^userContextId=2", "other", "other-account", ".existing.test", future, 1, 1)
  insert.run("^userContextId=2", "http", "plain", "127.0.0.1", future, 0, 256)
  await app.whenReady()
  const browserSession = session.fromPartition("persist:zen-test")
  await browserSession.cookies.set({ url: "https://existing.test", name: "auth", value: "mimo", expirationDate: future })
  const result = await importZenSession(browserSession.cookies)
  assert.deepEqual(result, { imported: 3, skipped: 2 })
  const saved = await browserSession.cookies.get({})
  assert.deepEqual(saved.map((cookie) => cookie.name).sort(), ["__Host-auth", "auth", "domain", "http"])
  assert.equal(saved.find((cookie) => cookie.name === "auth")?.value, "mimo")
  const host = saved.find((cookie) => cookie.name === "__Host-auth")
  assert.equal(host?.hostOnly, true)
  assert.equal(host?.httpOnly, true)
  assert.equal(host?.secure, true)
  assert.equal(host?.sameSite, "strict")
  assert.equal(host?.expirationDate, future)
  assert.equal(saved.find((cookie) => cookie.name === "domain")?.hostOnly, false)
  const server = createServer((request, response) => {
    response.end(request.headers.cookie === "http=plain" ? "authenticated" : "signed out")
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  assert.ok(address && typeof address !== "string")
  const view = new WebContentsView({ webPreferences: { session: browserSession, sandbox: true } })
  await view.webContents.loadURL(`http://127.0.0.1:${address.port}`)
  assert.equal(await view.webContents.executeJavaScript("document.body.innerText"), "authenticated")
  assert.equal((await view.webContents.session.cookies.get({ name: "__Host-auth" })).length, 1)
  view.webContents.close()
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  assert.deepEqual(await importZenSession(browserSession.cookies), { imported: 0, skipped: 5 })
  insert.run("^userContextId=3", "auth", "second-container", "example.test", future, 1, 1)
  await assert.rejects(importZenSession(browserSession.cookies), /MIMO_ZEN_CONTAINER/)
  process.env.MIMO_ZEN_CONTAINER = "0"
  const defaultSession = session.fromPartition("zen-default-test")
  assert.deepEqual(await importZenSession(defaultSession.cookies), { imported: 1, skipped: 0 })
  assert.equal((await defaultSession.cookies.get({}))[0].value, "different-account")
  database.close()
  console.log("Zen session checks passed")
}

void verify().then(() => app.quit(), (error) => {
  console.error(error)
  app.exit(1)
})
