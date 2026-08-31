import type { engineConnection } from "../../shared/engine-contract"

declare global {
  interface Window {
    desktop: {
      getEngineConnection(): Promise<typeof engineConnection.infer>
      chooseWorkingDirectory(): Promise<string | null>
      minimizeWindow(): Promise<void>
      toggleMaximizeWindow(): Promise<void>
      closeWindow(): Promise<void>
    }
  }
}

export {}
