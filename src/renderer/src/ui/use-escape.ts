import { useEffect } from "react"

export function useEscape(onEscape: () => void) {
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      const inSelect = event.target instanceof HTMLSelectElement
      const popoverOpen = !!document.querySelector(":popover-open")

      if (event.key === "Escape" && !inSelect && !popoverOpen) {
        onEscape()
      }
    }

    window.addEventListener("keydown", handleKey)

    return () => window.removeEventListener("keydown", handleKey)
  }, [onEscape])
}
