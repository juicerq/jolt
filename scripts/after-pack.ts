import { chmod } from "node:fs/promises"
import { join } from "node:path"
import { Arch, type AfterPackContext } from "electron-builder"

export async function afterPack({ appOutDir, packager, electronPlatformName, arch }: AfterPackContext) {
  if (electronPlatformName === "win32") {
    return
  }

  const executable = join(packager.getResourcesDir(appOutDir), "browser-driver", `agent-browser-${electronPlatformName}-${Arch[arch]}`)

  await chmod(executable, 0o755)
}
