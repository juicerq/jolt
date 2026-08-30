import type { engineConnection } from "../../shared/engine-contract"

declare global {
  interface Window {
    desktop: {
      getEngineConnection(): Promise<typeof engineConnection.infer>
    }
  }
}

export {}
