import { useEffect } from "react"

export function useEscape(onEscape: () => void) {
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      const inSelect = event.target instanceof HTMLSelectElement

      if (event.key === "Escape" && !inSelect) {
        onEscape()
      }
    }

    window.addEventListener("keydown", handleKey)

    return () => window.removeEventListener("keydown", handleKey)
  }, [onEscape])
}
