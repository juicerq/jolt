import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import React from "react"
import ReactDOM from "react-dom/client"
import { App } from "./app"
import { createEngineClient } from "./engine-client"
import { ChatPrototype } from "./chat/chat-prototype"
import "./styles.css"

const queryClient = new QueryClient()
const root = document.getElementById("root")

if (!root) {
  throw new Error("Renderer root is missing")
}

if (import.meta.env.DEV && import.meta.env.VITE_CHAT_PROTOTYPE === "1") {
  ReactDOM.createRoot(root).render(<ChatPrototype />)
} else {
  const connection = await window.desktop.getEngineConnection()
  const engineClient = createEngineClient(connection)

  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <App client={engineClient} />
      </QueryClientProvider>
    </React.StrictMode>,
  )
}
