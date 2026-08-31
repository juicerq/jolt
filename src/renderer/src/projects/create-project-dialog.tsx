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
  const { mutate, isPending, error } = useMutation(client.query.projects.create.mutationOptions({
    onSuccess() {
      queryClient.invalidateQueries({ queryKey: client.query.projects.list.queryOptions().queryKey })
      closeDialog()
    },
  }))

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
    <div className="prototype-overlay" role="presentation" onKeyDown={(event) => event.key === "Escape" && closeDialog()} onMouseDown={(event) => event.target === event.currentTarget && closeDialog()}>
      <dialog className="project-dialog" aria-labelledby="create-project-title" open>
        <form className="project-form" onSubmit={handleSubmit}>
          <header className="dialog-heading">
            <div><p className="eyebrow">Novo Projeto</p><h2 id="create-project-title">Agrupe Bots pela pasta</h2></div>
            <IconButton className="dialog-close-button" type="button" label="Fechar" tooltipPlacement="left" onClick={closeDialog}><XMarkIcon aria-hidden="true" /></IconButton>
          </header>
          <div className="project-form-body">
            <label>Nome<input autoFocus required placeholder="Ex: Jots" value={name} onChange={(event) => setName(event.target.value)} /></label>
            <div className="project-directory-field">
              <span>Pasta padrão</span>
              <button className="directory-picker" type="button" onClick={handleChooseDirectory}>
                <FolderIcon aria-hidden="true" />
                <span>{defaultWorkingDirectory || "Escolher pasta"}</span>
              </button>
              <small>Os Bots deste Projeto usam esta pasta quando não possuem uma pasta própria.</small>
            </div>
            {directoryError && <p className="error">Falha ao escolher a pasta: {directoryError}</p>}
            {error && <p className="error">Falha ao criar o Projeto: {error.message}</p>}
          </div>
          <footer className="form-actions project-form-actions">
            <button className="text-button" type="button" onClick={closeDialog}>Cancelar</button>
            <button type="submit" disabled={isPending || !name.trim() || !defaultWorkingDirectory}>{isPending ? "Criando..." : "Criar Projeto"}</button>
          </footer>
        </form>
      </dialog>
    </div>
  )
}
