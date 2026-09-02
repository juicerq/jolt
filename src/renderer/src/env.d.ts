import type { EngineConnection } from "../../shared/engine-ipc"

declare global {
  interface Window {
    desktop: {
      getEngineConnection(): Promise<EngineConnection>
      chooseWorkingDirectory(): Promise<string | null>
      minimizeWindow(): Promise<void>
      toggleMaximizeWindow(): Promise<void>
      closeWindow(): Promise<void>
    }
  }
}

export {}
