import { createServer } from "node:net"
import { app } from "electron"

export async function browserDebuggingPort(preferredPort: number) {
  return await availablePort(app.isPackaged ? 0 : preferredPort).catch(async (error: NodeJS.ErrnoException) => {
    if (error.code !== "EADDRINUSE") {
      throw error
    }

    return await availablePort(0)
  })
}

async function availablePort(port: number) {
  await using server = createServer()
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(port, "127.0.0.1", resolve)
  })
  const address = server.address()

  if (!address || typeof address === "string") {
    throw new Error("Could not allocate the browser debugging port")
  }

  return String(address.port)
}
