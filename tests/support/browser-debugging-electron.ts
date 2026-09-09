import assert from "node:assert/strict"
import { symlink } from "node:fs/promises"
import { createServer } from "node:net"
import { join } from "node:path"
import { app } from "electron"
import { browserDebuggingPort } from "@src/main/browser/browser-debugging"

async function verify() {
  const directory = process.argv.at(-2)
  const repository = process.argv.at(-1)
  assert.ok(directory && repository)
  app.setPath("userData", directory)
  app.setPath("home", directory)
  await symlink(join(repository, "node_modules"), join(directory, "node_modules"), "dir")

  await using occupied = createServer()
  const bound = await new Promise<boolean>((resolve, reject) => {
    occupied.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE") {
        resolve(false)
        return
      }

      reject(error)
    })
    occupied.listen(9222, "127.0.0.1", () => resolve(true))
  })
  const port = await browserDebuggingPort(9222)
  assert.notEqual(port, "9222")

  if (bound) {
    await new Promise<void>((resolve, reject) => occupied.close((error) => error ? reject(error) : resolve()))
    assert.equal(await browserDebuggingPort(9222), "9222")
  }

  app.commandLine.appendSwitch("remote-debugging-address", "127.0.0.1")
  app.commandLine.appendSwitch("remote-debugging-port", port)
  void app.whenReady().then(() => checkBrowser(port)).then(() => app.quit(), (error) => {
    console.error(error)
    app.exit(1)
  })
}

async function checkBrowser(port: string) {
  const response = await fetch(`http://127.0.0.1:${port}/json/version`)

  assert.equal(response.ok, true)
  console.log("Browser fallback checks passed")
}

await verify().catch((error) => {
  console.error(error)
  app.exit(1)
})
