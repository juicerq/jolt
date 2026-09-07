import type { EngineConnection } from "@src/shared/engine-ipc"

if (!window.desktop) {
  const tokenKey = "mimo.engine-token"
  const noop = async () => {}
  const unavailable = () => Promise.reject(new Error("Disponível só no notebook."))

  function pairedToken() {
    const token = new URLSearchParams(location.hash.slice(1)).get("token")

    if (token) {
      localStorage.setItem(tokenKey, token)
      history.replaceState(null, "", location.pathname + location.search)
    }

    return localStorage.getItem(tokenKey)
  }

  window.addEventListener("hashchange", () => location.reload())

  async function connection(): Promise<EngineConnection | null> {
    const token = pairedToken()

    if (!token) {
      return null
    }

    return { url: `${location.origin}/rpc`, token }
  }

  window.desktop = {
    remote: true,
    getEngineConnection: connection,
    renewEngineConnection: async () => {
      localStorage.removeItem(tokenKey)
      location.reload()

      return null
    },
    getMobileAccess: unavailable,
    configureMobileAccess: unavailable,
    unpairMobileAccess: unavailable,
    getBrowserState: unavailable,
    onBrowserState: () => {},
    onTurnNotificationOpened: () => {},
    onUpdateReady: () => {},
    openInBrowser: async (url) => {
      window.open(url, "_blank", "noopener")
    },
    chooseWorkingDirectory: async () => window.prompt("Caminho da pasta de trabalho"),
    watchBrowser: unavailable,
    takeBrowserControl: unavailable,
    setBrowserBounds: unavailable,
    resumeBrowser: unavailable,
    minimizeBrowser: unavailable,
    closeBrowser: unavailable,
    closeBrowserPopup: unavailable,
    minimizeWindow: noop,
    toggleMaximizeWindow: noop,
    closeWindow: noop,
    notifyTurnFinished: noop,
    installUpdate: noop,
  }
}
