import { Blobatar } from "@blobatar/react"
import type { ReactNode } from "react"
import type { Bot } from "../../../shared/bots"
import { Button } from "../ui/button"
import { revealClassName } from "./bot-form"

export function BotPage({ label, children, footer }: { label: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <section className="relative flex h-full min-h-0 flex-col overflow-y-auto bg-surface" aria-label={label}>
      <div className="mx-auto flex w-[min(560px,calc(100%-48px))] flex-1 flex-col gap-8 pt-12 pb-12 max-[720px]:mr-16 max-[720px]:ml-6 max-[720px]:w-auto">
        {children}
      </div>
      {footer}
    </section>
  )
}

export function BotPageIdentity({ bot }: { bot: Bot }) {
  return (
    <header className="flex items-center gap-4">
      <Blobatar className="size-16 flex-none rounded-[18px] border border-outline-strong bg-surface-raised" name={bot.avatarSeed} size={64} alt="" />
      <div className="min-w-0 flex-1">
        <h2 className="m-0 text-title font-semibold text-primary">{bot.name}</h2>
        <p className="m-0 mt-1 text-control font-medium text-secondary">{bot.function.outcome}</p>
      </div>
    </header>
  )
}

export function BotPageSaveBar({ form, complete, saving, failure, saveLabel = "Salvar", onDiscard }: { form: string; complete: boolean; saving: boolean; failure?: string; saveLabel?: string; onDiscard: () => void }) {
  return (
    <div className={`${revealClassName} sticky bottom-0 z-10 border-t border-outline bg-surface`}>
      <div className="mx-auto flex w-[min(560px,calc(100%-48px))] items-center justify-between gap-4 py-3 max-[720px]:mr-16 max-[720px]:ml-6 max-[720px]:w-auto">
        <p className={`m-0 text-support ${failure ? "text-status-error" : "text-muted"}`}>{failure ?? "Alterações não salvas"}</p>
        <div className="flex gap-2">
          <Button variant="text" type="button" disabled={saving} onClick={onDiscard}>Descartar</Button>
          <Button type="submit" form={form} disabled={saving || !complete}>{saving ? "Salvando..." : saveLabel}</Button>
        </div>
      </div>
    </div>
  )
}
