import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { Bot, BotExecutionSettingChange } from "@src/shared/bots"
import type { EngineClient } from "../engine-client"

export function useUpdateBotExecution(bot: Pick<Bot, "id">, client: EngineClient) {
  const queryClient = useQueryClient()
  const { mutate, isPending } = useMutation(client.query.bots.updateExecution.mutationOptions({
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: client.query.projects.list.queryOptions().queryKey })
    },
  }))

  function update(change: BotExecutionSettingChange) {
    mutate({ id: bot.id, ...change })
  }

  return { update, isPending }
}
