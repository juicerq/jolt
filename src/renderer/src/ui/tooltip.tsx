import { type CSSProperties, type FocusEvent, type ReactNode, type Ref, useId, useRef } from "react"

export type TooltipPlacement = "top" | "right" | "bottom" | "left"

const placementClassNames: Record<TooltipPlacement, string> = {
  top: "[position-area:top] mb-2 starting:translate-y-0.5",
  right: "[position-area:right] ml-2 starting:-translate-x-0.5",
  bottom: "[position-area:bottom] mt-2 starting:-translate-y-0.5",
  left: "[position-area:left] mr-2 starting:translate-x-0.5",
}

export function useTooltip() {
  const anchorName = `--tooltip-${useId().replace(/[^a-zA-Z0-9-]/g, "")}`
  const popoverRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const show = () => {
    clearTimeout(timerRef.current)
    popoverRef.current?.showPopover()
  }
  const hide = () => {
    clearTimeout(timerRef.current)
    popoverRef.current?.hidePopover()
  }
  const showAfterDelay = () => {
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(show, 160)
  }
  const showOnKeyboardFocus = (event: FocusEvent<HTMLElement>) => {
    const keyboardFocus = event.currentTarget.matches(":focus-visible")

    if (keyboardFocus) {
      show()
    }
  }

  return {
    focusProps: { onFocus: showOnKeyboardFocus, onBlur: hide },
    anchorProps: { style: { anchorName } satisfies CSSProperties, onPointerEnter: showAfterDelay, onPointerLeave: hide, onFocus: showOnKeyboardFocus, onBlur: hide },
    popoverProps: { anchorName, ref: popoverRef },
  }
}

export function Tooltip({ anchorName, children, placement = "top", ref }: { anchorName: string; children: ReactNode; placement?: TooltipPlacement; ref: Ref<HTMLDivElement> }) {
  return (
    <div
      className={`pointer-events-none inset-auto m-0 w-max max-w-[220px] rounded-lg border border-outline bg-surface-active px-2 py-1.5 text-center text-metadata font-medium whitespace-normal text-primary shadow-[0_8px_24px_rgb(0_0_0/24%)] transition-[opacity,transform,display] transition-discrete duration-120 ease-out [position-try-fallbacks:flip-block,flip-inline] starting:opacity-0 motion-reduce:transition-none ${placementClassNames[placement]}`}
      popover="manual"
      ref={ref}
      role="tooltip"
      style={{ positionAnchor: anchorName }}
    >
      {children}
    </div>
  )
}
