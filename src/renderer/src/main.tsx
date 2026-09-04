import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import React from "react"
import ReactDOM from "react-dom/client"
import { App } from "./app"
import { selectBot } from "./bots/bots-store"
import { createEngineClient } from "./engine-client"
import { browserStore } from "./browser/browser-store"
import { markUpdateReady } from "./settings/app-update-store"
import { subscribeChatEvents } from "./chat/chat-events"
import "./styles.css"

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } })
const root = document.getElementById("root")

if (!root) {
  throw new Error("Renderer root is missing")
}

const connection = await window.desktop.getEngineConnection()
const engineClient = createEngineClient(connection)
subscribeChatEvents({ client: engineClient, queryClient })
window.desktop.onTurnNotificationOpened(selectBot)
window.desktop.onUpdateReady(markUpdateReady)
window.desktop.onBrowserState((state) => browserStore.setState(() => state))
void window.desktop.getBrowserState().then((state) => browserStore.setState(() => state))

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App client={engineClient} />
    </QueryClientProvider>
  </React.StrictMode>,
)
