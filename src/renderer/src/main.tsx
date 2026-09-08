import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import React, { type ReactNode } from "react"
import ReactDOM from "react-dom/client"
import { App } from "./app"
import { subscribeWorkspaceNavigation } from "./bots/workspace-navigation"
import { selectBot } from "./bots/bots-store"
import { createEngineClient } from "./engine-client"
import { createDesktopBrowser } from "./browser/browser-desktop"
import { subscribeBrowserPages } from "./browser/browser-pages"
import { createRemoteBrowser } from "./browser/browser-remote"
import { browserStore } from "./browser/browser-store"
import { markUpdateReady } from "./settings/app-update-store"
import { MobilePairingRequired } from "./settings/mobile-pairing"
import { refreshProviders } from "./settings/provider-mutations"
import { chatVisits } from "./chat/chat-visits"
import { subscribeChatEvents } from "./chat/chat-events"
import "./desktop-shim"
import "./styles.css"

const root = document.getElementById("root")

if (!root) {
  throw new Error("Renderer root is missing")
}

const reactRoot = ReactDOM.createRoot(root)

function render(node: ReactNode) {
  reactRoot.render(<React.StrictMode>{node}</React.StrictMode>)
}

const connection = await window.desktop.getEngineConnection()

if (!connection) {
  render(<MobilePairingRequired />)
} else {
  subscribeWorkspaceNavigation()
  chatVisits.subscribe()
  const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } })
  const engineClient = createEngineClient(connection)
  subscribeChatEvents({ client: engineClient, queryClient })
  window.desktop.onTurnNotificationOpened(selectBot)
  window.desktop.onUpdateReady(markUpdateReady)
  const browser = window.desktop.remote ? createRemoteBrowser(engineClient) : createDesktopBrowser()

  if (window.desktop.remote) {
    subscribeBrowserPages(engineClient)
  } else {
    window.desktop.onBrowserState((state) => browserStore.setState(() => state))
    void window.desktop.getBrowserState().then((state) => browserStore.setState(() => state))
  }

  render(
    <QueryClientProvider client={queryClient}>
      <App browser={browser} client={engineClient} />
    </QueryClientProvider>,
  )

  void engineClient.raw.providers.refreshModels({}).then(() => refreshProviders(engineClient, queryClient)).catch(() => {})
}
