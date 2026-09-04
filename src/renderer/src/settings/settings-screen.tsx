import { XMarkIcon } from "@heroicons/react/24/outline"
import { useSelector } from "@tanstack/react-store"
import { closeWorkspaceScreen } from "../bots/bots-store"
import type { EngineClient } from "../engine-client"
import { ChatEdgeTab } from "../chat/chat-edge-tab"
import { IconButton } from "../ui/icon-button"
import { SettingsSection, settingsPanelClassName } from "../ui/settings-section"
import { Switch } from "../ui/switch"
import { useEscape } from "../ui/use-escape"
import { appSettingsStore, setActivityDetailsVisible } from "./app-settings-store"
import { ProviderConnections } from "./provider-connections"

export function SettingsScreen({ client }: { client: EngineClient }) {
  const activityDetailsVisible = useSelector(appSettingsStore, (state) => state.activityDetailsVisible)
  useEscape(closeWorkspaceScreen)

  return (
    <>
      <section className="flex h-full min-h-0 flex-col overflow-y-auto bg-surface" aria-label="Configurações">
        <div className="mx-auto flex w-[min(560px,calc(100%-48px))] flex-1 flex-col gap-8 pt-12 pb-12">
          <header>
            <h2 className="m-0 text-title font-semibold text-primary">Configurações</h2>
            <p className="m-0 mt-1 text-support font-normal text-muted">Preferências do Jolt neste computador</p>
          </header>
          <SettingsSection title="Conversa">
            <div className={`${settingsPanelClassName} flex items-center justify-between gap-6`}>
              <div className="min-w-0 flex-1">
                <p className="m-0 text-control font-medium text-primary">Mostrar detalhes do trabalho</p>
                <p className="m-0 mt-1 max-w-[46ch] text-support font-normal text-muted">Mostra pensamentos, arquivos e ações dos Bots. Ocultar não apaga o histórico.</p>
              </div>
              <Switch checked={activityDetailsVisible} aria-label="Mostrar detalhes do trabalho" onChange={setActivityDetailsVisible} />
            </div>
          </SettingsSection>
          <ProviderConnections client={client} />
        </div>
      </section>
      <ChatEdgeTab>
        <IconButton iconSize={16} type="button" label="Fechar configurações" tooltipPlacement="left" onClick={closeWorkspaceScreen}><XMarkIcon aria-hidden="true" /></IconButton>
      </ChatEdgeTab>
    </>
  )
}
