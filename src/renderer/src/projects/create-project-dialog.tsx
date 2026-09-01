import { FolderIcon, XMarkIcon } from "@heroicons/react/24/outline"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { type FormEvent, useState } from "react"
import { closeDialog } from "../bots/bots-store"
import type { EngineClient } from "../engine-client"
import { IconButton } from "../ui/icon-button"

export function CreateProjectDialog({ client }: { client: EngineClient }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState("")
  const [defaultWorkingDirectory, setDefaultWorkingDirectory] = useState("")
  const [directoryError, setDirectoryError] = useState<string>()
  const { mutate, isPending, error } = useMutation(
    client.query.projects.create.mutationOptions({
      onSuccess() {
        queryClient.invalidateQueries({
          queryKey: client.query.projects.list.queryOptions().queryKey,
        })
        closeDialog()
      },
    }),
  )

  async function handleChooseDirectory() {
    setDirectoryError(undefined)
    const selected = await window.desktop.chooseWorkingDirectory().catch((selectionError: unknown) => {
      setDirectoryError(selectionError instanceof Error ? selectionError.message : "Não foi possível abrir a pasta")
      return null
    })

    if (selected) {
      setDefaultWorkingDirectory(selected)
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const projectName = name.trim()

    if (!projectName || !defaultWorkingDirectory) {
      return
    }

    mutate({ name: projectName, defaultWorkingDirectory })
  }

  return (
    <div
      className="fixed inset-0 z-40 grid place-items-center bg-overlay p-6 backdrop-blur-[8px]"
      role="presentation"
      onKeyDown={(event) => event.key === "Escape" && closeDialog()}
      onMouseDown={(event) => event.target === event.currentTarget && closeDialog()}
    >
      <dialog
        className="relative inset-auto m-auto box-border w-[min(480px,100%)] max-w-none overflow-hidden rounded-[18px] border border-outline-strong bg-surface-raised p-0 text-primary shadow-[0_2px_8px_rgb(0_0_0/45%),0_28px_90px_rgb(0_0_0/58%)]"
        aria-labelledby="create-project-title"
        open
      >
        <form onSubmit={handleSubmit}>
          <header className="flex items-center justify-between gap-4 border-b border-outline px-6 pt-6 pb-[18px]">
            <div>
              <p className="m-0 text-metadata font-semibold tracking-[0.08em] text-muted uppercase">Novo Projeto</p>
              <h2 className="mt-1.25 mb-0 text-title font-semibold text-primary" id="create-project-title">
                Agrupe Bots pela pasta
              </h2>
            </div>
            <IconButton className="shrink-0" type="button" label="Fechar" tooltipPlacement="left" onClick={closeDialog}><XMarkIcon aria-hidden="true" /></IconButton>
          </header>
          <div className="flex flex-col gap-5 p-6">
            <label className="flex flex-col gap-2 text-control font-semibold text-secondary">
              Nome
              <input
                className="box-border w-full rounded-lg border border-outline-strong bg-canvas px-3 py-2.5 text-control font-medium text-primary placeholder:text-muted focus-visible:border-focus focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
                autoFocus
                required
                placeholder="Ex: Jots"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <div className="flex min-w-0 flex-col gap-2">
              <span className="flex items-baseline justify-between text-control font-semibold text-secondary">Pasta padrão</span>
              <button
                className="flex w-full min-w-0 cursor-pointer items-center gap-2.5 rounded-lg border border-outline-strong bg-canvas px-3 py-[11px] text-left text-control font-medium text-secondary hover:border-focus hover:bg-surface-hover hover:text-primary focus-visible:border-focus focus-visible:bg-surface-hover focus-visible:text-primary focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none active:bg-surface-active"
                type="button"
                onClick={handleChooseDirectory}
              >
                <FolderIcon className="size-[17px] shrink-0" aria-hidden="true" />
                <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{defaultWorkingDirectory || "Escolher pasta"}</span>
              </button>
              <small className="text-support text-muted">Os Bots deste Projeto usam esta pasta quando não possuem uma pasta própria.</small>
            </div>
            {directoryError && <p className="m-0 text-support text-status-error">Falha ao escolher a pasta: {directoryError}</p>}
            {error && <p className="m-0 text-support text-status-error">Falha ao criar o Projeto: {error.message}</p>}
          </div>
          <footer className="flex items-center justify-end gap-4 border-t border-outline px-6 py-4">
            <button
              className="mr-auto shrink-0 cursor-pointer rounded-lg border-0 bg-transparent px-3.5 py-2.5 text-control font-medium text-muted hover:bg-surface-hover hover:text-primary focus-visible:bg-surface-hover focus-visible:text-primary focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none active:bg-surface-active"
              type="button"
              onClick={closeDialog}
            >
              Cancelar
            </button>
            <button
              className="shrink-0 cursor-pointer rounded-lg border-0 bg-accent px-3.5 py-2.5 text-control font-semibold text-accent-ink hover:bg-primary focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none active:bg-secondary disabled:cursor-default disabled:bg-surface-active disabled:text-muted"
              type="submit"
              disabled={isPending || !name.trim() || !defaultWorkingDirectory}
            >
              {isPending ? "Criando..." : "Criar Projeto"}
            </button>
          </footer>
        </form>
      </dialog>
    </div>
  )
}
