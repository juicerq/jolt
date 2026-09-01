import type { ButtonHTMLAttributes } from "react"

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "text" | "danger" }

const baseClassName = "shrink-0 cursor-pointer rounded-lg px-3.5 py-2.5 text-control focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-default"

const variantClassNames = {
  primary: "border-0 bg-accent font-semibold text-accent-ink hover:bg-primary active:bg-focus disabled:bg-surface-active disabled:text-muted",
  text: "border-0 bg-transparent font-medium text-muted hover:bg-surface-hover hover:text-primary focus-visible:bg-surface-hover focus-visible:text-primary active:bg-surface-active",
  danger: "border border-outline-strong bg-transparent font-medium text-status-error hover:bg-surface-hover focus-visible:bg-surface-hover active:bg-surface-active disabled:opacity-60",
}

export function Button({ variant = "primary", className, ...props }: ButtonProps) {
  return <button {...props} className={[baseClassName, variantClassNames[variant], className].filter(Boolean).join(" ")} />
}
