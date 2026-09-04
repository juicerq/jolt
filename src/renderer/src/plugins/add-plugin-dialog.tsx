import { useMutation, useQueryClient } from "@tanstack/react-query"
import { type FormEvent, useState } from "react"
import type { EngineClient } from "../engine-client"
import { Button } from "../ui/button"
import { Dialog, DialogActions, DialogBody } from "../ui/dialog"
import { Field, fieldControlClassName } from "../ui/field"

function parseEnvironment(text: string) {
  return Object.fromEntries(text.split("\n").flatMap((line) => {
    const separator = line.indexOf("=")
    const name = line.slice(0, separator).trim()

    if (separator < 1 || !name) {
      return []
    }

    return [[name, line.slice(separator + 1).trim()]]
  }))
}

export function AddPluginDialog({ client, onClose }: { client: EngineClient; onClose: () => void }) {
  return (
    <Dialog eyebrow="Novo Plugin" title="Conecte um servidor MCP" onClose={onClose}>
      <AddPluginForm client={client} onClose={onClose} />
    </Dialog>
  )
}

function AddPluginForm({ client, onClose }: { client: EngineClient; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState("")
  const [command, setCommand] = useState("")
  const [environment, setEnvironment] = useState("")
  const { mutate, isPending, error } = useMutation(client.query.plugins.addCustom.mutationOptions({
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: client.query.plugins.list.queryOptions().queryKey })
      onClose()
    },
  }))
  const pluginName = name.trim()
  const pluginCommand = command.trim()

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!pluginName || !pluginCommand) {
      return
    }

    mutate({ name: pluginName, command: pluginCommand, env: parseEnvironment(environment) })
  }

  return (
    <form className="flex min-h-0 flex-col" onSubmit={handleSubmit}>
      <DialogBody>
        <Field label="Nome"><input className={fieldControlClassName} autoFocus required placeholder="Ex: Linear" value={name} onChange={(event) => setName(event.target.value)} /></Field>
        <Field label="Comando"><input className={`${fieldControlClassName} font-mono`} required placeholder="npx -y linear-mcp-server" value={command} onChange={(event) => setCommand(event.target.value)} /></Field>
        <Field label="Variáveis de ambiente" optional>
          <textarea className={`${fieldControlClassName} field-sizing-content max-h-40 min-h-20 resize-none font-mono font-normal`} placeholder={"LINEAR_API_KEY=lin_api_..."} rows={3} value={environment} onChange={(event) => setEnvironment(event.target.value)} />
          <small className="text-support font-normal text-muted">Uma por linha, no formato NOME=valor. Os valores ficam guardados cifrados.</small>
        </Field>
        {error && <p className="text-support text-status-error">Falha ao adicionar o Plugin: {error.message}</p>}
      </DialogBody>
      <DialogActions>
        <Button variant="text" type="button" disabled={isPending} onClick={onClose}>Cancelar</Button>
        <Button type="submit" disabled={isPending || !pluginName || !pluginCommand}>{isPending ? "Iniciando..." : "Adicionar Plugin"}</Button>
      </DialogActions>
    </form>
  )
}
