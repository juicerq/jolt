import { Store } from "@tanstack/react-store"

export const appUpdateStore = new Store({ updateReady: false })

export function markUpdateReady() {
  appUpdateStore.setState(() => ({ updateReady: true }))
}
