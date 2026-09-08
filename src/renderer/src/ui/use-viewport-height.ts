import { useSyncExternalStore } from "react"

function subscribe(onChange: () => void) {
  window.visualViewport?.addEventListener("resize", onChange)
  window.addEventListener("resize", onChange)

  return () => {
    window.visualViewport?.removeEventListener("resize", onChange)
    window.removeEventListener("resize", onChange)
  }
}

function height() {
  if (window.visualViewport?.scale === 1) {
    return window.visualViewport.height
  }

  return window.innerHeight
}

export function useViewportHeight() {
  return useSyncExternalStore(subscribe, height)
}
