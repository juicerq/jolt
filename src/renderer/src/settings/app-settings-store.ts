import { Store } from "@tanstack/react-store"

const activityDetailsStorageKey = "mimo.activity-details-visible"
const sidebarModeStorageKey = "mimo.sidebar-mode"
export type SidebarMode = "traditional" | "compact" | "hidden"

function readSidebarMode(): SidebarMode {
  const saved = localStorage.getItem(sidebarModeStorageKey)

  if (saved === "compact" || saved === "hidden") {
    return saved
  }

  return "traditional"
}

export const appSettingsStore = new Store({
  activityDetailsVisible: localStorage.getItem(activityDetailsStorageKey) === "true",
  sidebarMode: readSidebarMode(),
})

export function setSidebarMode(sidebarMode: SidebarMode) {
  localStorage.setItem(sidebarModeStorageKey, sidebarMode)
  appSettingsStore.setState((state) => ({ ...state, sidebarMode }))
}

export function setActivityDetailsVisible(activityDetailsVisible: boolean) {
  localStorage.setItem(activityDetailsStorageKey, String(activityDetailsVisible))
  appSettingsStore.setState((state) => ({ ...state, activityDetailsVisible }))
}
