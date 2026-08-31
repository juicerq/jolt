import type { ButtonHTMLAttributes, ReactNode } from "react"

type TooltipPlacement = "top" | "right" | "bottom" | "left"

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> & {
  children: ReactNode
  label: string
  tooltipPlacement?: TooltipPlacement
}

export function IconButton({ children, className, label, tooltipPlacement = "top", ...props }: IconButtonProps) {
  const classes = className ? `icon-button ${className}` : "icon-button"

  return (
    <button {...props} className={classes} aria-label={label} data-tooltip={label} data-tooltip-placement={tooltipPlacement}>
      {children}
    </button>
  )
}
