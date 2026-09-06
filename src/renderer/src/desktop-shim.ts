import { engineConnection } from "@src/shared/engine-ipc"
import { parse } from "@src/shared/parse"

// Fora do Electron (navegador do celular via `bun run dev:mobile`) não existe preload.
// ponytail: só o que o boot e o chat usam; navegador embutido e janela viram no-op.
if (!window.desktop) {
  const noop = async () => {}

  window.desktop = {
    getEngineConnection: async () => parse(engineConnection, await fetch("/engine-connection.json").then((response) => response.json())),
    getBrowserState: async () => ({ pages: [], focusedBotId: null }),
    onBrowserState: () => {},
    onTurnNotificationOpened: () => {},
    onUpdateReady: () => {},
    openInBrowser: async (url) => {
      window.open(url, "_blank", "noopener")
    },
    chooseWorkingDirectory: async () => window.prompt("Caminho da pasta de trabalho"),
    watchBrowser: noop,
    takeBrowserControl: noop,
    setBrowserBounds: noop,
    resumeBrowser: noop,
    minimizeBrowser: noop,
    closeBrowser: noop,
    closeBrowserPopup: noop,
    minimizeWindow: noop,
    toggleMaximizeWindow: noop,
    closeWindow: noop,
    notifyTurnFinished: noop,
    installUpdate: noop,
  }
}
