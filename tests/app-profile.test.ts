import { expect, test } from "bun:test"
import { MIMO_DAILY_DEBUGGING_PORT, MIMO_LOAD_DEBUGGING_PORT, resolveAppProfile } from "@src/shared/app-profile"

test("keeps daily work and load benchmarks on distinct desktop identities", () => {
  expect(resolveAppProfile({ packaged: false, loadProvider: false })).toEqual({
    name: "Mimo Dev",
    title: "Mimo Dev",
    desktopName: "mimo-dev",
    icon: "icon-dev.png",
    debuggingPort: MIMO_DAILY_DEBUGGING_PORT,
    loadProvider: false,
  })
  expect(resolveAppProfile({ packaged: false, loadProvider: true })).toEqual({
    name: "Mimo Load",
    title: "Mimo Load",
    desktopName: "mimo-load",
    icon: "icon-load.png",
    debuggingPort: MIMO_LOAD_DEBUGGING_PORT,
    loadProvider: true,
  })
})

test("does not expose development identity in the packaged app", () => {
  expect(resolveAppProfile({ packaged: true, loadProvider: true })).toEqual({
    name: "Mimo",
    title: "Mimo",
    icon: "icon.png",
    debuggingPort: 0,
    loadProvider: false,
  })
})
