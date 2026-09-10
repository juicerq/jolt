import type { ReactNode } from "react"
import { Button } from "../ui/button"

const botPageColumnClassName = "mx-auto w-[min(560px,calc(100%-48px))] max-md:w-[calc(100%-32px)]"

export const revealClassName = "transition-[opacity,transform] duration-180 ease-out starting:translate-y-1 starting:opacity-0 motion-reduce:transition-none"

export function BotPage({ label, children, footer }: { label: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <section className="relative flex h-full min-h-0 flex-col overflow-y-auto bg-surface" aria-label={label}>
      <div className={`${botPageColumnClassName} flex flex-1 flex-col gap-8 pt-12 pb-12 max-md:pt-6 max-md:pb-8`}>
        {children}
      </div>
      {footer}
    </section>
  )
}

export function BotPageSaveBar({ form, complete, saving, failure, saveLabel = "Salvar", onDiscard }: { form: string; complete: boolean; saving: boolean; failure?: string; saveLabel?: string; onDiscard: () => void }) {
  return (
    <div className={`${revealClassName} sticky bottom-0 z-10 border-t border-outline bg-surface`}>
      <div className={`${botPageColumnClassName} flex items-center justify-between gap-4 py-3`}>
        <p className={`m-0 text-support ${failure ? "text-status-error" : "text-muted"}`}>{failure ?? "Alterações não salvas"}</p>
        <div className="flex gap-2">
          <Button variant="text" type="button" disabled={saving} onClick={onDiscard}>Descartar</Button>
          <Button type="submit" form={form} disabled={saving || !complete}>{saving ? "Salvando..." : saveLabel}</Button>
        </div>
      </div>
    </div>
  )
}
