import type { Desktop } from "@src/shared/desktop"

declare global {
  interface Window {
    desktop: Desktop
  }
}

export {}
