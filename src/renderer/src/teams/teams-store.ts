import { Store } from "@tanstack/react-store"

type TeamsState = {
  selectedTeamId: string | null
  isCreateOpen: boolean
}

export const teamsStore = new Store<TeamsState>({
  selectedTeamId: null,
  isCreateOpen: false,
})

export function selectTeam(teamId: string) {
  teamsStore.setState((state) => ({ ...state, selectedTeamId: teamId, isCreateOpen: false }))
}

export function openCreateTeam() {
  teamsStore.setState((state) => ({ ...state, isCreateOpen: true }))
}

export function closeCreateTeam() {
  teamsStore.setState((state) => ({ ...state, isCreateOpen: false }))
}
