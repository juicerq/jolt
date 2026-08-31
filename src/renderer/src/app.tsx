import { MinusIcon, Square2StackIcon, XMarkIcon } from "@heroicons/react/24/outline"
import type { EngineClient } from "./engine-client"
import { BotsWorkspace } from "./bots/bots-workspace"

export function App({ client }: { client: EngineClient }) {
  return (
    <main className="jots-app">
      <WindowControls />
      <BotsWorkspace client={client} />
    </main>
  )
}

function WindowControls() {
  return (
    <div className="window-titlebar">
      <div className="window-controls">
        <button type="button" aria-label="Minimizar janela" onClick={() => window.desktop.minimizeWindow()}>
          <MinusIcon aria-hidden="true" />
        </button>
        <button type="button" aria-label="Maximizar ou restaurar janela" onClick={() => window.desktop.toggleMaximizeWindow()}>
          <Square2StackIcon aria-hidden="true" />
        </button>
        <button className="window-close-button" type="button" aria-label="Fechar janela" onClick={() => window.desktop.closeWindow()}>
          <XMarkIcon aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
