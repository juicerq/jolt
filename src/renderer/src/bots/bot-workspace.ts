export function workspaceInput(choice: string) {
  const [kind, id] = choice.split(":", 2)

  if (kind === "leader" && id) {
    return { leaderBotId: id }
  }

  if (kind === "project" && id) {
    return { projectId: id }
  }

  return {}
}
