const OUTPUT_LIMIT_BYTES = 65_536

export type ProviderProcess = Bun.PipedSubprocess

async function terminate(processHandle: ProviderProcess) {
  if (globalThis.process.platform === "win32") {
    const taskkill = Bun.spawn(["taskkill", "/pid", String(processHandle.pid), "/t", "/f"], {
      stdout: "ignore",
      stderr: "ignore",
    })
    await taskkill.exited
  } else {
    try {
      globalThis.process.kill(-processHandle.pid, "SIGKILL")
    } catch {
      if (processHandle.exitCode === null) {
        processHandle.kill("SIGKILL")
      }
    }
  }

  await processHandle.exited
}

export async function withProviderProcess<T>(
  command: string[],
  timeoutMs: number,
  operation: (processHandle: ProviderProcess) => Promise<T>,
) {
  const processHandle = Bun.spawn(command, {
    detached: true,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  })
  let timeout: ReturnType<typeof setTimeout> | undefined

  try {
    return await Promise.race([
      operation(processHandle),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error("Provider probe timed out")), timeoutMs)
      }),
    ])
  } finally {
    if (timeout) {
      clearTimeout(timeout)
    }

    await terminate(processHandle)
  }
}

export async function readProviderOutput(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let bytes = 0

  while (true) {
    const chunk = await reader.read()

    if (chunk.done) {
      break
    }

    bytes += chunk.value.byteLength

    if (bytes > OUTPUT_LIMIT_BYTES) {
      await reader.cancel()
      throw new Error("Provider output limit exceeded")
    }

    chunks.push(chunk.value)
  }

  const output = new Uint8Array(bytes)
  let offset = 0

  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.byteLength
  }

  return new TextDecoder().decode(output)
}

export function runProviderCommand(command: string[], timeoutMs: number) {
  return withProviderProcess(command, timeoutMs, async (processHandle) => {
    const [exitCode, stdout, stderr] = await Promise.all([
      processHandle.exited,
      readProviderOutput(processHandle.stdout),
      readProviderOutput(processHandle.stderr),
    ])

    return { exitCode, stdout, stderr }
  })
}
