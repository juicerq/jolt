import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import type { Bot } from "@src/shared/bots"
import type { EngineClient } from "../engine-client"
import { Button } from "../ui/button"
import { promptWidthClassName } from "./chat-composer"

export function ChatTeamControl({ bot, members, client }: { bot: Bot; members: Bot[]; client: EngineClient }) {
  if (bot.leaderBotId || members.length === 0) {
    return null
  }

  return <TeamWorkControl botId={bot.id} client={client} />
}

function TeamWorkControl({ botId, client }: { botId: string; client: EngineClient }) {
  const { data: hasWork, error: statusError } = useQuery(client.query.conversations.teamWorking.queryOptions({ input: { botId } }))
  const [interrupted, setInterrupted] = useState(false)
  const queryClient = useQueryClient()
  const { mutate: abort, isPending, error } = useMutation(client.query.conversations.abortTeam.mutationOptions({
    async onSuccess() {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: client.query.projects.key() }),
        queryClient.invalidateQueries({ queryKey: client.query.tasks.key() }),
        queryClient.invalidateQueries({ queryKey: client.query.conversations.teamWorking.key() }),
      ])
      setInterrupted(true)
    },
  }))

  if (hasWork && interrupted) {
    setInterrupted(false)
  }

  if (!hasWork && !isPending && !interrupted && !error && !statusError) {
    return null
  }

  return (
    <div className={`${promptWidthClassName} mb-2 flex flex-col items-end gap-1`}>
      {(hasWork || isPending || statusError) && <Button variant="text" type="button" disabled={isPending} onClick={() => abort({ botId })}>{isPending ? "Interrompendo trabalho do time..." : "Interromper trabalho do time"}</Button>}
      {interrupted && <p className="m-0 text-support text-secondary" role="status">Trabalho do time interrompido. As mensagens na Fila foram preservadas.</p>}
      {error && <p className="m-0 text-support text-status-error" role="alert">Falha ao interromper o time: {error.message}</p>}
      {statusError && <p className="m-0 text-support text-status-error" role="alert">Não foi possível verificar o trabalho do time: {statusError.message}</p>}
    </div>
  )
}
