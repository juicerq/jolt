import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { isAbsolute, join } from "node:path"
import type { Cookies } from "electron"
import { z } from "zod"

const sameSites = { 0: "no_restriction", 1: "lax", 2: "strict", 256: "unspecified" } as const
const cookieSchema = z.object({
  name: z.string(),
  value: z.string(),
  host: z.string().min(1),
  path: z.string().startsWith("/"),
  expiry: z.number().positive(),
  isSecure: z.union([z.literal(0), z.literal(1)]).transform(Boolean),
  isHttpOnly: z.union([z.literal(0), z.literal(1)]).transform(Boolean),
  sameSite: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(256)]),
}).transform((cookie) => ({
  url: `${cookie.isSecure ? "https" : "http"}://${cookie.host.replace(/^\./, "")}${cookie.path}`,
  name: cookie.name,
  value: cookie.value,
  ...(cookie.host.startsWith(".") ? { domain: cookie.host } : {}),
  path: cookie.path,
  secure: cookie.isSecure,
  httpOnly: cookie.isHttpOnly,
  expirationDate: cookie.expiry,
  sameSite: sameSites[cookie.sameSite],
}))

async function findProfile() {
  if (process.env.MIMO_ZEN_PROFILE) {
    return process.env.MIMO_ZEN_PROFILE
  }

  const home = homedir()
  const roots = [
    join(process.env.XDG_CONFIG_HOME || join(home, ".config"), "zen"),
    join(home, ".zen"),
    join(home, ".var/app/app.zen_browser.zen/.zen"),
    join(home, "Library/Application Support/zen"),
    ...(process.env.APPDATA ? [join(process.env.APPDATA, "zen")] : []),
  ]

  for (const root of roots) {
    const contents = await readFile(join(root, "profiles.ini"), "utf8").catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") {
        throw new Error("Não foi possível ler o perfil do Zen.")
      }

      return null
    })

    if (!contents) {
      continue
    }

    const sections = contents.split(/^\[/m).slice(1).map((section) => ({
      name: section.slice(0, section.indexOf("]")),
      values: Object.fromEntries([...section.matchAll(/^([^=\r\n]+)=(.*)$/gm)].map((entry) => [entry[1].trim(), entry[2].trim()])),
    }))
    const installed = sections.filter((section) => section.name.startsWith("Install")).map((section) => section.values.Default).filter(Boolean)
    const defaults = [...new Set(installed)]

    if (defaults.length > 1) {
      throw new Error("Há vários perfis padrão do Zen. Defina MIMO_ZEN_PROFILE com a pasta desejada.")
    }

    const profiles = sections.filter((section) => section.name.startsWith("Profile"))
    const profile = profiles.find((section) => section.values.Default === "1") ?? (profiles.length === 1 ? profiles[0] : undefined)
    const path = defaults[0] ?? profile?.values.Path

    if (!path) {
      throw new Error("Selecione o perfil do Zen usando MIMO_ZEN_PROFILE.")
    }

    if (isAbsolute(path)) {
      return path
    }

    return join(root, path)
  }

  return null
}

/** Imports one Zen identity before any Mimo page navigates. Never writes to Zen. */
export async function importZenSession(cookies: Pick<Cookies, "get" | "set" | "flushStore">) {
  const profile = await findProfile()

  if (!profile) {
    return { imported: 0, skipped: 0 }
  }

  const { DatabaseSync } = await import("node:sqlite")
  const database = new DatabaseSync(join(profile, "cookies.sqlite"), { readOnly: true, timeout: 1000 })
  const now = Date.now() / 1000
  const rows = (() => {
    try {
      // Partitioned and private cookies cannot be flattened into a shared session.
      const identities = z.array(z.object({ originAttributes: z.string() })).parse(database.prepare(
        "SELECT DISTINCT originAttributes FROM moz_cookies WHERE expiry > ? AND originAttributes GLOB '^userContextId=[0-9]*' AND originAttributes NOT LIKE '%&%'",
      ).all(now))
      const selected = process.env.MIMO_ZEN_CONTAINER

      if (!selected && identities.length > 1) {
        throw new Error("Há várias contas no Zen. Defina MIMO_ZEN_CONTAINER com o ID do contêiner desejado (0 para o padrão).")
      }

      if (selected && !/^\d+$/.test(selected)) {
        throw new Error("MIMO_ZEN_CONTAINER deve ser um ID numérico.")
      }

      const identity = (() => {
        if (!selected) {
          return identities[0]?.originAttributes ?? ""
        }

        if (Number(selected) === 0) {
          return ""
        }

        return `^userContextId=${Number(selected)}`
      })()

      return database.prepare(
        "SELECT name, value, host, path, expiry, isSecure, isHttpOnly, sameSite FROM moz_cookies WHERE originAttributes = ? AND expiry > ?",
      ).all(identity, now)
    } finally {
      database.close()
    }
  })()
  const existing = (await cookies.get({})).flatMap((cookie) => cookie.domain ? [cookie.domain.replace(/^\./, "")] : [])
  let imported = 0
  let skipped = 0

  for (const row of rows) {
    const result = cookieSchema.safeParse(row)

    if (!result.success) {
      skipped += 1
      continue
    }

    const cookie = result.data
    const host = new URL(cookie.url).hostname

    // Keep a site's Mimo identity intact, rather than mixing two accounts' cookies.
    if (existing.some((domain) => host === domain || host.endsWith(`.${domain}`) || domain.endsWith(`.${host}`))) {
      skipped += 1
      continue
    }

    await cookies.set(cookie).then(() => { imported += 1 }, () => { skipped += 1 })
  }

  await cookies.flushStore()

  return { imported, skipped }
}
