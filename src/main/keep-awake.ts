import { powerMonitor, powerSaveBlocker } from "electron"

export function createKeepAwake() {
  let enabled = false
  let blocker: number | undefined

  function apply() {
    const wanted = enabled && !powerMonitor.isOnBatteryPower()

    if (wanted && blocker === undefined) {
      blocker = powerSaveBlocker.start("prevent-app-suspension")
    }

    if (!wanted && blocker !== undefined) {
      powerSaveBlocker.stop(blocker)
      blocker = undefined
    }
  }

  powerMonitor.on("on-ac", apply)
  powerMonitor.on("on-battery", apply)

  return {
    set(next: boolean) {
      enabled = next
      apply()
    },
    onBattery() {
      return powerMonitor.isOnBatteryPower()
    },
  }
}
