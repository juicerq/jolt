import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { Bot } from "../../../shared/bots"
import type { EngineClient } from "../engine-client"

export function useUpdateBot(bot: Bot, client: EngineClient) {
  const queryClient = useQueryClient()
  const { mutate, isPending } = useMutation(client.query.bots.update.mutationOptions({
    onSuccess() {
      queryClient.invalidateQueries({ queryKey: client.query.projects.list.queryOptions().queryKey })
    },
  }))

  function update(changes: Partial<Pick<Bot, "effort" | "model">>) {
    mutate({ id: bot.id, name: bot.name, function: bot.function, projectId: bot.projectId, workingDirectoryOverride: bot.workingDirectoryOverride, memoryEnabled: bot.memoryEnabled, effort: bot.effort, model: bot.model, ...changes })
  }

  return { update, isPending }
}
