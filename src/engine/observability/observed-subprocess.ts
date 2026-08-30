import type { Observability } from "./observability"

export function runObservedSubprocess(command: string[], observability: Observability) {
  return observability.span({ name: "subprocess.execute", attributes: { process: command[0] } }, async () => {
    const subprocess = Bun.spawn(command, { stdout: "pipe", stderr: "pipe" })
    const [exitCode, stdout, stderr] = await Promise.all([
      subprocess.exited,
      new Response(subprocess.stdout).text(),
      new Response(subprocess.stderr).text(),
    ])

    if (exitCode !== 0) {
      throw Object.assign(new Error("Subprocess failed"), { code: String(exitCode) })
    }

    return { stdout, stderr }
  })
}
