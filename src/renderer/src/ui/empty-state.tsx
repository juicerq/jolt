import type { ReactNode } from "react"

export function EmptyState({ title, description }: { title: string; description?: ReactNode }) {
  return (
    <div className="flex size-full min-h-60 flex-col items-center justify-center gap-1.5 px-7 text-center animate-rise motion-reduce:animate-none">
      <strong className="text-section font-semibold text-primary">{title}</strong>
      {description && <p className="text-support text-secondary">{description}</p>}
    </div>
  )
}
