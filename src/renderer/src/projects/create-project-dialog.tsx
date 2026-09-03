import { useMutation, useQueryClient } from "@tanstack/react-query"
import { type FormEvent, useState } from "react"
import { closeDialog } from "../bots/bots-store"
import type { EngineClient } from "../engine-client"
import { Button } from "../ui/button"
import { Dialog, DialogActions, DialogBody } from "../ui/dialog"
import { DirectoryPicker, useDirectoryChooser } from "../ui/directory-picker"
import { Field, fieldControlClassName } from "../ui/field"

export function CreateProjectDialog({ client }: { client: EngineClient }) {
  return (
    <Dialog eyebrow="Novo Projeto" title="Agrupe Bots pela pasta" onClose={closeDialog}>
      <CreateProjectForm client={client} />
    </Dialog>
  )
}

function CreateProjectForm({ client }: { client: EngineClient }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState("")
  const [defaultWorkingDirectory, setDefaultWorkingDirectory] = useState("")
  const directory = useDirectoryChooser(setDefaultWorkingDirectory)
  const { mutate, isPending, error } = useMutation(client.query.projects.create.mutationOptions({
    onSuccess() {
      queryClient.invalidateQueries({ queryKey: client.query.projects.list.queryOptions().queryKey })
      closeDialog()
    },
  }))
  const projectName = name.trim()

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!projectName || !defaultWorkingDirectory) {
      return
    }

    mutate({ name: projectName, defaultWorkingDirectory })
  }

  return (
    <form className="flex min-h-0 flex-col" onSubmit={handleSubmit}>
      <DialogBody>
        <Field label="Nome"><input className={fieldControlClassName} autoFocus required placeholder="Ex: Jolt" value={name} onChange={(event) => setName(event.target.value)} /></Field>
        <Field label="Pasta padrão" as="div">
          <DirectoryPicker value={defaultWorkingDirectory} placeholder="Escolher pasta" onChoose={directory.choose} />
          <small className="text-support font-normal text-muted">Os Bots deste Projeto usam esta pasta quando não possuem uma pasta própria.</small>
        </Field>
        {directory.error && <p className="text-support text-status-error">Falha ao escolher a pasta: {directory.error}</p>}
        {error && <p className="text-support text-status-error">Falha ao criar o Projeto: {error.message}</p>}
      </DialogBody>
      <DialogActions>
        <Button variant="text" type="button" onClick={closeDialog}>Cancelar</Button>
        <Button type="submit" disabled={isPending || !projectName || !defaultWorkingDirectory}>{isPending ? "Criando..." : "Criar Projeto"}</Button>
      </DialogActions>
    </form>
  )
}
