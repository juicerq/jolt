import { TrashIcon } from "@heroicons/react/24/outline"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { Bot } from "@src/shared/bots"
import type { EngineClient } from "../engine-client"
import { Button } from "../ui/button"
import { ConfirmationDialog } from "../ui/dialog"
import { forgetBot } from "./bots-store"
import { teamOf } from "./team"

export function BotRemovalDialog({ bot, client, onClose }: { bot: Bot; client: EngineClient; onClose: () => void }) {
  const queryClient = useQueryClient()
  const { data: groups, isPending, error } = useQuery(client.query.projects.list.queryOptions())
  const { members } = teamOf(groups, bot)
  const { mutate: remove, isPending: removing, error: removeError } = useMutation(client.query.bots.remove.mutationOptions({
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: client.query.projects.key() })
      void queryClient.invalidateQueries({ queryKey: client.query.plugins.key() })

      for (const removed of [bot, ...members]) {
        forgetBot(removed.id)
      }

      onClose()
    },
  }))

  return <ConfirmationDialog icon={<TrashIcon />} title="Excluir Bot" onClose={() => !removing && onClose()} actions={<>
    <Button variant="text" type="button" autoFocus disabled={removing} onClick={onClose}>Cancelar</Button>
    <Button variant="danger" type="button" disabled={removing || isPending || !!error} onClick={() => remove({ id: bot.id })}>{removing ? "Excluindo..." : "Excluir Bot"}</Button>
  </>}>
    <BotRemovalDetails bot={bot} members={members} />
    {isPending && <p className="m-0 text-support text-secondary">Carregando integrantes...</p>}
    {(removeError || error) && <p className="m-0 text-support text-status-error" role="alert">Falha ao excluir o Bot: {(removeError ?? error)?.message}</p>}
  </ConfirmationDialog>
}

function BotRemovalDetails({ bot, members }: { bot: Pick<Bot, "name">; members: Bot[] }) {
  return <>
    <p className="m-0 text-control text-secondary">Excluir {bot.name} apaga sua conversa, sua memória e seu Diretório privado. Não é possível desfazer.</p>
    {members.length > 0 && <>
      <p className="m-0 text-control text-secondary">Também exclui {members.length} {members.length === 1 ? "Integrante, com sua conversa, memória e Diretório privado:" : "Integrantes, com suas conversas, memórias e Diretórios privados:"}</p>
      <ul className="m-0 max-h-48 overflow-y-auto pl-5 text-control text-secondary">
        {members.map((member) => <li key={member.id}>{member.name}{member.closed ? " · Temporário encerrado" : ""}</li>)}
      </ul>
    </>}
  </>
}

