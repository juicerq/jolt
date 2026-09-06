import { useSyncExternalStore } from "react"

const mobileMedia = window.matchMedia("(width < 48rem)")

function subscribe(onChange: () => void) {
  mobileMedia.addEventListener("change", onChange)

  return () => mobileMedia.removeEventListener("change", onChange)
}

function getSnapshot() {
  return mobileMedia.matches
}

export function useIsMobile() {
  return useSyncExternalStore(subscribe, getSnapshot)
}
