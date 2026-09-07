import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { EngineAccessMessage } from "../shared/engine-ipc"
import { type MobileAccess, type MobileAccessSettings, defaultEnginePort, mobileAccessSettings, mobileAccessUpdate } from "../shared/mobile-access"
import { parse } from "../shared/parse"
import { loadSecret, renewSecret } from "./secret-file"
import { issueCertificate, readTailscale, serve, unserve } from "./tailscale"

type EngineAccess = Omit<EngineAccessMessage, "type">

interface MobileAccessOptions {
  directory: string
  engine: { readonly port: number | undefined; grant(access: EngineAccess): Promise<void> }
  keepAwake: { set(enabled: boolean): void; onBattery(): boolean }
  rendererPort?: number
}

const storedSettings = mobileAccessSettings.catch({ enabled: false, hostname: null })

export function createMobileAccess({ directory, engine, keepAwake, rendererPort }: MobileAccessOptions) {
  const settingsPath = join(directory, "mobile-access.json")
  const tokenPath = join(directory, "engine-token.key")
  let settings = parse(storedSettings, undefined)
  let token = ""

  function access(): EngineAccess {
    return { token, ...(settings.hostname ? { origin: `https://${settings.hostname}` } : {}) }
  }

  async function save(next: MobileAccessSettings) {
    settings = next
    keepAwake.set(settings.enabled)
    await writeFile(settingsPath, JSON.stringify(settings))
  }

  async function expose(hostname: string, port: number) {
    const failure = await serve(port)

    if (!failure) {
      void issueCertificate(hostname)
    }

    return failure
  }

  async function get(): Promise<MobileAccess> {
    const listeningPort = engine.port

    if (!listeningPort) {
      throw new Error("O Engine não está rodando.")
    }

    const targetPort = rendererPort ?? listeningPort
    const { hostname, servePort } = await readTailscale()

    if (hostname && hostname !== settings.hostname) {
      await save({ ...settings, hostname })
      await engine.grant(access())
    }

    const failure = settings.enabled && hostname && servePort !== targetPort ? await expose(hostname, targetPort) : null
    const link = settings.enabled && hostname && !failure ? `https://${hostname}/#token=${token}` : null

    return { hostname, targetPort, enabled: settings.enabled, onBattery: keepAwake.onBattery(), link, failure }
  }

  return {
    get,
    async load() {
      settings = parse(storedSettings, await readFile(settingsPath, "utf8").then(JSON.parse).catch(() => {}))
      token = await loadSecret(tokenPath)
      keepAwake.set(settings.enabled)

      return { ...access(), port: defaultEnginePort }
    },
    async restore() {
      if (settings.enabled) {
        await get().catch(() => {})
      }
    },
    async configure(raw: unknown) {
      await save({ ...settings, ...parse(mobileAccessUpdate, raw) })

      if (!settings.enabled) {
        await unserve()
      }

      return get()
    },
    async unpair() {
      token = await renewSecret(tokenPath)
      await engine.grant(access())

      return get()
    },
  }
}
