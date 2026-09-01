import type { MouseEvent } from "react"

export function blurMouseClick(event: MouseEvent<HTMLElement>) {
  const focused = document.activeElement

  if (event.detail > 0 && focused instanceof HTMLElement && event.currentTarget.contains(focused)) {
    focused.blur()
  }
}
