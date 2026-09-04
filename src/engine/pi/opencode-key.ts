import { homedir } from "node:os"
import { join } from "node:path"
import { z } from "zod"

const opencodeAuthFile = z.record(z.string(), z.looseObject({ type: z.string(), key: z.string().min(1).optional() }))

function authFilePath() {
  const dataHome = process.env.XDG_DATA_HOME

  return join(dataHome || join(homedir(), ".local", "share"), "opencode", "auth.json")
}

export async function detectOpencodeKey() {
  const contents = await Bun.file(authFilePath()).json().catch(() => {})
  const parsed = opencodeAuthFile.safeParse(contents)

  if (!parsed.success) {
    return
  }

  const credential = parsed.data["opencode-go"] ?? parsed.data.opencode

  if (credential?.type !== "api") {
    return
  }

  return credential.key
}
