import { useSelector } from "@tanstack/react-store"
import { PluginsScreen } from "../plugins/plugins-screen"
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
  const listOpen = useSelector(botsStore, (state) => state.listOpen)

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
    <section className="grid size-full min-h-0 grid-cols-[286px_minmax(0,1fr)] gap-3 overflow-hidden bg-canvas py-3 pr-3 max-md:grid-cols-1 max-md:gap-0 max-md:p-0" aria-label="Bots">
      <ProjectsSidebar client={client} className={listOpen ? "" : "max-md:hidden"} />
      <div className={`mobile-screen relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-shell border border-outline bg-surface max-md:rounded-none max-md:border-0 ${listOpen ? "max-md:hidden" : ""}`}>
        <WorkspaceTopBar client={client} />
        <div className="relative min-h-0 min-w-0 flex-1">{workspaceContent()}</div>
      </div>
      {dialog === "create-project" && <CreateProjectDialog client={client} />}
    </section>
  )
}
