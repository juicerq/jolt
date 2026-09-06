import { useSelector } from "@tanstack/react-store"
import { PluginsScreen } from "../plugins/plugins-screen"
import { BotsRail } from "../projects/bots-rail"
import { CreateProjectDialog } from "../projects/create-project-dialog"
import { ProjectsSidebar } from "../projects/projects-sidebar"
import { SettingsScreen } from "../settings/settings-screen"
import type { EngineClient } from "../engine-client"
import { BotChat } from "./bot-chat"
import { botsStore } from "./bots-store"
import { NewBot } from "./new-bot"
import { WorkspaceTopBar } from "./workspace-top-bar"

export function BotsWorkspace({ client }: { client: EngineClient }) {
  const dialog = useSelector(botsStore, (state) => state.dialog)
  const selectedBotId = useSelector(botsStore, (state) => state.selectedBotId)
  const draft = useSelector(botsStore, (state) => state.draft)
  const screen = useSelector(botsStore, (state) => state.screen)

  function workspaceContent() {
    if (screen === "plugins") {
      return <PluginsScreen client={client} />
    }

    if (screen === "settings") {
      return <SettingsScreen client={client} />
    }

    if (draft) {
      return <NewBot client={client} draft={draft} />
    }

    return <BotChat key={selectedBotId ?? "no-bot"} client={client} botId={selectedBotId} />
  }

  return (
    <section className="grid size-full min-h-0 grid-cols-[286px_minmax(0,1fr)] gap-3 overflow-hidden bg-canvas py-3 pr-3 max-md:grid-cols-[64px_minmax(0,1fr)] max-md:gap-2 max-md:pt-[calc(8px+var(--safe-top))] max-md:pr-2 max-md:pb-[calc(8px+var(--safe-bottom))]" aria-label="Bots">
      <ProjectsSidebar client={client} />
      <BotsRail client={client} />
      <div className="relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-shell border border-outline bg-surface">
        <WorkspaceTopBar client={client} />
        <div className="relative min-h-0 min-w-0 flex-1">{workspaceContent()}</div>
      </div>
      {dialog === "create-project" && <CreateProjectDialog client={client} />}
    </section>
  )
}
