import { Store } from "@tanstack/react-store"

const activityDetailsStorageKey = "jolt.activity-details-visible"

export const appSettingsStore = new Store({
  activityDetailsVisible: localStorage.getItem(activityDetailsStorageKey) === "true",
})

export function setActivityDetailsVisible(activityDetailsVisible: boolean) {
  localStorage.setItem(activityDetailsStorageKey, String(activityDetailsVisible))
  appSettingsStore.setState((state) => ({ ...state, activityDetailsVisible }))
}
