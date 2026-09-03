import type { ButtonHTMLAttributes, ReactNode } from "react"
import { Tooltip, type TooltipPlacement, useTooltip } from "./tooltip"

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> & {
  children: ReactNode
  current?: boolean
  iconSize?: 13 | 14 | 16 | 17
  label: string
  position?: "absolute" | "relative"
  shape?: "circle" | "rounded"
  size?: 24 | 28 | 30 | 32 | 34
  tone?: "canvas" | "danger" | "ghost" | "primary" | "window-close"
  tooltipPlacement?: TooltipPlacement
}

const iconSizeClassNames = {
  13: "[&>svg]:size-[13px]",
  14: "[&>svg]:size-3.5",
  16: "[&>svg]:size-4",
  17: "[&>svg]:size-[17px]",
}

const sizeClassNames = {
  24: "size-6",
  28: "size-7",
  30: "size-[30px]",
  32: "size-8",
  34: "size-[34px]",
}

const toneClassNames = {
  canvas: "border-0 bg-canvas text-muted hover:bg-surface-hover hover:text-primary focus-visible:bg-surface-hover focus-visible:text-primary active:bg-surface-active disabled:opacity-40",
  danger: "border border-outline-strong bg-transparent text-status-error hover:bg-surface-hover focus-visible:bg-surface-hover active:bg-surface-active disabled:opacity-60",
  ghost: "border-0 bg-transparent text-muted hover:bg-surface-hover hover:text-primary focus-visible:bg-surface-hover focus-visible:text-primary active:bg-surface-active disabled:opacity-40",
  "ghost-current": "border-0 bg-surface-active text-primary hover:bg-surface-hover hover:text-primary focus-visible:bg-surface-hover focus-visible:text-primary active:bg-surface-active disabled:opacity-40",
  primary: "border-0 bg-accent text-accent-ink hover:bg-primary focus-visible:bg-primary active:bg-primary disabled:opacity-60",
  "window-close": "border-0 bg-transparent text-muted hover:bg-[color-mix(in_oklch,var(--color-status-error)_15%,transparent)] hover:text-status-error focus-visible:bg-[color-mix(in_oklch,var(--color-status-error)_15%,transparent)] focus-visible:text-status-error active:bg-surface-active disabled:opacity-40",
}

const iconButtonClassName = "grid shrink-0 place-items-center p-0 transition-[color,background-color,opacity] duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none"

export function IconButton({ children, className, current = false, iconSize = 17, label, position = "relative", shape = "rounded", size = 32, tone = "ghost", tooltipPlacement = "top", ...props }: IconButtonProps) {
  const tooltip = useTooltip()
  const classes = [
    iconButtonClassName,
    position,
    shape === "circle" ? "rounded-full" : "rounded-lg",
    sizeClassNames[size],
    iconSizeClassNames[iconSize],
    toneClassNames[current && tone === "ghost" ? "ghost-current" : tone],
    className,
  ].filter(Boolean).join(" ")

  return (
    <>
      <button {...props} {...tooltip.anchorProps} className={classes} aria-current={current ? "page" : undefined} aria-label={label}>
        {children}
      </button>
      <Tooltip {...tooltip.popoverProps} placement={tooltipPlacement}>{label}</Tooltip>
    </>
  )
}
