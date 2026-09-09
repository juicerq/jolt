export const MIMO_DAILY_DEBUGGING_PORT = 9222
export const MIMO_LOAD_DEBUGGING_PORT = 9223

interface AppProfileInput {
  packaged: boolean
  loadProvider: boolean
}

interface AppProfile {
  name: string
  title: string
  desktopName?: string
  icon: string
  debuggingPort: number
  loadProvider: boolean
}

export function resolveAppProfile({ packaged, loadProvider }: AppProfileInput): AppProfile {
  if (packaged) {
    return {
      name: "Mimo",
      title: "Mimo",
      icon: "icon.png",
      debuggingPort: 0,
      loadProvider: false,
    }
  }

  if (loadProvider) {
    return {
      name: "Mimo Load",
      title: "Mimo Load",
      desktopName: "mimo-load",
      icon: "icon-load.png",
      debuggingPort: MIMO_LOAD_DEBUGGING_PORT,
      loadProvider: true,
    }
  }

  return {
    name: "Mimo Dev",
    title: "Mimo Dev",
    desktopName: "mimo-dev",
    icon: "icon-dev.png",
    debuggingPort: MIMO_DAILY_DEBUGGING_PORT,
    loadProvider: false,
  }
}
