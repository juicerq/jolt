import { createServer } from "node:net"
import { app } from "electron"

export async function browserDebuggingPort() {
  if (!app.isPackaged) {
    return "9222"
  }

  await using server = createServer()
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  })
  const address = server.address()

  if (!address || typeof address === "string") {
    throw new Error("Could not allocate the browser debugging port")
  }

  return String(address.port)
}
