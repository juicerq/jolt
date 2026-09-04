import { ArrowPathIcon, XMarkIcon } from "@heroicons/react/24/outline"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { type FormEvent, useState } from "react"
import { BotFace } from "./bot-face"
import { ChatEdgeTab } from "../chat/chat-edge-tab"
import type { EngineClient } from "../engine-client"
import { Button } from "../ui/button"
import { IconButton } from "../ui/icon-button"
import { useEscape } from "../ui/use-escape"
import { revealClassName } from "./bot-form"
import { botDraftAvatarSeed, type BotDraft, discardDraft, nameDraft, regenerateDraftAvatar, selectBot } from "./bots-store"

export function NewBot({ client, draft }: { client: EngineClient; draft: BotDraft }) {
  const queryClient = useQueryClient()
  const [avatarRevision, setAvatarRevision] = useState(0)
  const { data: providers, error: providersError, isPending: providersPending } = useQuery(client.query.providers.list.queryOptions())
  const executorAvailable = providers?.some((candidate) => candidate.status === "available") ?? false
  const { mutate, isPending, error } = useMutation(client.query.bots.create.mutationOptions({
    onSuccess(bot) {
      void queryClient.invalidateQueries({ queryKey: client.query.projects.list.queryOptions().queryKey })
      selectBot(bot.id)
    },
  }))
  const avatarSeed = botDraftAvatarSeed(draft)
  const hasName = !!draft.name.trim()

  useEscape(discardDraft)

  function regenerateAvatar() {
    regenerateDraftAvatar()
    setAvatarRevision((revision) => revision + 1)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = draft.name.trim()

    if (!name || isPending || !executorAvailable) {
      return
    }

    nameDraft(name)
    mutate({ name, avatarSeed: botDraftAvatarSeed({ ...draft, name }) })
  }

  return (
    <>
      <section className="relative grid h-full min-h-0 overflow-y-auto bg-surface" aria-label="Novo Bot">
        <form className="m-auto flex w-[min(520px,calc(100%-48px))] flex-col items-center gap-2 py-12 text-center" onSubmit={handleSubmit}>
          <div className="relative">
            <BotFace className="size-[77px] flex-none" name={avatarSeed} size={77} />
            <IconButton className="right-1 bottom-1" iconSize={13} position="absolute" shape="circle" size={24} tone="raised" type="button" label="Gerar outro avatar" tooltipPlacement="right" onClick={regenerateAvatar}><ArrowPathIcon key={avatarRevision} className={avatarRevision > 0 ? "animate-spin [animation-duration:280ms] [animation-iteration-count:1] [animation-timing-function:cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:animate-none" : ""} aria-hidden="true" /></IconButton>
          </div>
          <label className="sr-only" htmlFor="new-bot-name">Nome do Bot</label>
          <input
            className="mt-4 mb-1.5 w-[280px] rounded-xl border-0 bg-surface-raised px-4 py-3 text-center text-title font-semibold text-primary placeholder:font-normal placeholder:text-muted focus-visible:bg-surface-hover focus-visible:outline-none"
            id="new-bot-name"
            autoFocus
            autoComplete="off"
            placeholder="Nome"
            value={draft.name}
            onChange={(event) => nameDraft(event.target.value)}
          />
          <div className="mt-4 h-[38px] w-[280px]">
            {hasName && <Button className={`${revealClassName} h-full w-full`} type="submit" disabled={isPending || !executorAvailable}>{isPending ? "Criando..." : "Criar"}</Button>}
          </div>
          {providersError && <p className="m-0 text-support text-status-error">Falha ao verificar executores: {providersError.message}</p>}
          {!providersPending && !providersError && !executorAvailable && <p className="m-0 text-support text-status-warning">Conecte um Fornecedor nas Configurações para criar um Bot.</p>}
          {error && <p className="m-0 text-support text-status-error">Falha ao criar o Bot: {error.message}</p>}
        </form>
      </section>
      <ChatEdgeTab>
        <IconButton iconSize={16} type="button" label="Descartar criação" tooltipPlacement="left" onClick={discardDraft}><XMarkIcon aria-hidden="true" /></IconButton>
      </ChatEdgeTab>
    </>
  )
}
