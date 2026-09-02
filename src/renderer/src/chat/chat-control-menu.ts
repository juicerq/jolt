import type { CSSProperties } from "react"
import { menuCardClassName } from "../ui/menu"

export const chatControlChipClassName = "flex h-[26px] shrink-0 items-center gap-1 rounded-md border-0 bg-transparent px-2 text-metadata font-medium whitespace-nowrap text-muted transition-colors duration-150 hover:bg-surface-hover hover:text-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-default disabled:opacity-40 motion-reduce:transition-none [&>svg]:size-3 [&>svg]:stroke-2"
export const chatControlPopoverClassName = `${menuCardClassName} inset-auto mb-2 transition-[opacity,transform,display,overlay] transition-discrete duration-120 ease-out [position-area:top_span-left] [position-try-fallbacks:flip-block,flip-inline] starting:translate-y-0.5 starting:opacity-0 motion-reduce:transition-none`

export function chatControlAnchor(popoverId: string) {
  const anchorName = `--${popoverId}`

  return {
    anchorName,
    trigger: { anchorName } satisfies CSSProperties,
    popover: { positionAnchor: anchorName } satisfies CSSProperties,
  }
}
