import type { ButtonHTMLAttributes } from "react"

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "text" }

const baseClassName = "shrink-0 cursor-pointer rounded-lg border-0 px-3.5 py-2.5 text-control focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-default"

const variantClassNames = {
  primary: "bg-accent font-semibold text-accent-ink hover:bg-primary active:bg-focus disabled:bg-surface-active disabled:text-muted",
  text: "bg-transparent font-medium text-muted hover:bg-surface-hover hover:text-primary focus-visible:bg-surface-hover focus-visible:text-primary active:bg-surface-active",
}

export function Button({ variant = "primary", className, ...props }: ButtonProps) {
  return <button {...props} className={[baseClassName, variantClassNames[variant], className].filter(Boolean).join(" ")} />
}
