import type { ButtonHTMLAttributes, ReactNode } from "react"

type TooltipPlacement = "top" | "right" | "bottom" | "left"

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> & {
  children: ReactNode
  iconSize?: 13 | 14 | 16 | 17
  label: string
  position?: "absolute" | "relative"
  shape?: "circle" | "rounded"
  size?: 24 | 28 | 30 | 32 | 34
  tone?: "canvas" | "danger" | "ghost" | "primary" | "window-close"
  tooltipPlacement?: TooltipPlacement
}

const placementClassNames: Record<TooltipPlacement, string> = {
  top: "after:bottom-[calc(100%+8px)] after:left-1/2 after:-translate-x-1/2 after:translate-y-0.5 hover:after:translate-y-0 focus-visible:after:translate-y-0",
  right: "after:top-1/2 after:left-[calc(100%+8px)] after:-translate-x-0.5 after:-translate-y-1/2 hover:after:translate-x-0 focus-visible:after:translate-x-0",
  bottom: "after:top-[calc(100%+8px)] after:left-1/2 after:-translate-x-1/2 after:-translate-y-0.5 hover:after:translate-y-0 focus-visible:after:translate-y-0",
  left: "after:top-1/2 after:right-[calc(100%+8px)] after:translate-x-0.5 after:-translate-y-1/2 hover:after:translate-x-0 focus-visible:after:translate-x-0",
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
  primary: "border-0 bg-accent text-accent-ink hover:bg-primary focus-visible:bg-primary active:bg-primary disabled:opacity-60",
  "window-close": "border-0 bg-transparent text-muted hover:bg-[color-mix(in_oklch,var(--color-status-error)_15%,transparent)] hover:text-status-error focus-visible:bg-[color-mix(in_oklch,var(--color-status-error)_15%,transparent)] focus-visible:text-status-error active:bg-surface-active disabled:opacity-40",
}

const iconButtonClassName = "grid shrink-0 place-items-center p-0 transition-[color,background-color,opacity] duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none after:pointer-events-none after:absolute after:z-50 after:w-max after:max-w-[220px] after:rounded-lg after:border after:border-outline after:bg-surface-active after:px-2 after:py-1.5 after:text-center after:text-metadata after:font-medium after:text-primary after:opacity-0 after:shadow-[0_8px_24px_rgb(0_0_0/24%)] after:content-[attr(data-tooltip)] after:transition-[opacity,transform] after:delay-0 after:duration-120 after:ease-out after:whitespace-normal hover:after:opacity-100 hover:after:delay-160 focus-visible:after:opacity-100 focus-visible:after:delay-0"

export function IconButton({ children, className, iconSize = 17, label, position = "relative", shape = "rounded", size = 32, tone = "ghost", tooltipPlacement = "top", ...props }: IconButtonProps) {
  const classes = [
    iconButtonClassName,
    position,
    shape === "circle" ? "rounded-full" : "rounded-lg",
    sizeClassNames[size],
    iconSizeClassNames[iconSize],
    toneClassNames[tone],
    placementClassNames[tooltipPlacement],
    className,
  ].filter(Boolean).join(" ")

  return (
    <button {...props} className={classes} aria-label={label} data-tooltip={label}>
      {children}
    </button>
  )
}
