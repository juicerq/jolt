import type { ButtonHTMLAttributes } from "react"

export function InlineAction({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className={["m-0 cursor-pointer border-0 bg-transparent p-0 font-[inherit] text-[inherit] underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring", className].filter(Boolean).join(" ")} />
}
