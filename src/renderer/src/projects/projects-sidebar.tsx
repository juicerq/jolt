import { Blobatar } from "@blobatar/react"
import { FolderIcon, UserPlusIcon } from "@heroicons/react/24/outline"
import { useQuery } from "@tanstack/react-query"
import { useSelector } from "@tanstack/react-store"
import type { Bot } from "../../../shared/bots"
import { botsStore, openCreateBot, openCreateProject, selectBot } from "../bots/bots-store"
import { chatStore, type ChatStatus } from "../chat/chat-store"
import type { EngineClient } from "../engine-client"

const chatStatusLabels: Record<ChatStatus, string> = {
  available: "Disponível",
  working: "Trabalhando",
  waiting: "Interrompendo",
  completed: "Concluído",
  error: "Erro",
}

const chatStatusClassNames: Record<ChatStatus, string> = {
  available: "bg-status-success",
  working: "bg-status-working",
  waiting: "bg-status-warning",
  completed: "bg-status-success",
  error: "bg-status-error",
}

const teamAvatarPositionClassNames = ["top-0 left-[9px] z-1", "bottom-0 left-0 z-2", "right-0 bottom-0 z-3"]

export function ProjectsSidebar({ client }: { client: EngineClient }) {
  const selectedBotId = useSelector(botsStore, (state) => state.selectedBotId)
  const statuses = useSelector(chatStore, (state) => state.statuses)
  const { data, error, isPending } = useQuery(client.query.projects.list.queryOptions())

  return (
    <aside className="grid min-w-0 grid-rows-[auto_1fr] bg-sidebar pt-[58px] pr-0 pb-2.5 pl-3 max-[720px]:grid-rows-[auto_minmax(0,1fr)] max-[720px]:items-stretch max-[720px]:overflow-hidden max-[720px]:pl-2">
      <div className="mb-2 flex min-h-9 items-center justify-between gap-4 max-[720px]:mx-0 max-[720px]:self-start max-[720px]:justify-center">
        <h2 className="m-0 text-metadata font-semibold tracking-[0.08em] text-muted uppercase max-[720px]:hidden">Bots</h2>
        <div className="flex gap-1">
          <button
            className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-lg border-0 bg-transparent p-0 text-muted hover:bg-surface-hover hover:text-primary focus-visible:bg-surface-hover focus-visible:text-primary focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none active:bg-surface-active"
            type="button"
            aria-label="Criar projeto"
            onClick={openCreateProject}
          >
            <FolderIcon className="size-4" aria-hidden="true" />
          </button>
          <button
            className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-lg border-0 bg-transparent p-0 text-muted hover:bg-surface-hover hover:text-primary focus-visible:bg-surface-hover focus-visible:text-primary focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none active:bg-surface-active"
            type="button"
            aria-label="Criar bot"
            onClick={openCreateBot}
          >
            <UserPlusIcon className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>
      {error && <p className="mx-2.5 my-3 text-support text-status-error">Falha ao carregar Projetos: {error.message}</p>}
      {isPending && <p className="mx-2.5 my-3 text-support text-secondary">Carregando Projetos...</p>}
      {data && data.projects.length === 0 && data.unassignedBots.length === 0 && (
        <div className="flex min-h-45 flex-col items-center justify-center gap-1.5 text-center text-support text-secondary">
          <strong className="text-section font-semibold text-primary">Nenhum Bot</strong>
          <span>Crie um Bot ou Projeto para começar.</span>
        </div>
      )}
      {data && (
        <nav className="min-h-0 overflow-y-auto pr-2 max-[720px]:block max-[720px]:overflow-x-hidden" aria-label="Projetos e Bots">
          {data.projects.map((project) => (
            <section className="[&+&]:mt-5" key={project.id} aria-labelledby={`project-${project.id}`}>
              <div className="flex items-center justify-between gap-2 px-2.5 pb-1.5 max-[720px]:hidden">
                <h3
                  className="m-0 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-metadata font-semibold tracking-[0.08em] text-muted uppercase"
                  id={`project-${project.id}`}
                >
                  {project.name}
                </h3>
              </div>
              {project.bots.length === 0 ? (
                <p className="m-0 px-2.5 pt-[7px] pb-[9px] text-support text-muted max-[720px]:hidden">Nenhum Bot</p>
              ) : (
                <ul className="m-0 list-none p-0 max-[720px]:block">
                  {project.bots.map((bot) => (
                    <BotGroup bot={bot} key={bot.id} selectedBotId={selectedBotId} statuses={statuses} />
                  ))}
                </ul>
              )}
            </section>
          ))}
          {data.unassignedBots.length > 0 && (
            <section className="border-t border-outline pt-4 [&+&]:mt-5" aria-labelledby="unassigned-bots">
              <div className="flex items-center justify-between gap-2 px-2.5 pb-1.5 max-[720px]:hidden">
                <h3 className="m-0 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-metadata font-semibold tracking-[0.08em] text-muted uppercase" id="unassigned-bots">
                  Sem projeto
                </h3>
              </div>
              <ul className="m-0 list-none p-0 max-[720px]:block">
                {data.unassignedBots.map((bot) => (
                  <BotGroup bot={bot} key={bot.id} selectedBotId={selectedBotId} statuses={statuses} />
                ))}
              </ul>
            </section>
          )}
        </nav>
      )}
    </aside>
  )
}

function BotGroup({ bot, selectedBotId, statuses }: { bot: Bot & { members: Bot[] }; selectedBotId: string | null; statuses: Record<string, ChatStatus | undefined> }) {
  return (
    <li className="block border-0 p-0">
      <BotRow bot={bot} members={bot.members} selected={selectedBotId === bot.id} status={statuses[bot.id] ?? "available"} />
      {bot.members.length > 0 && (
        <ul className="mt-0 mr-0 mb-2 ml-5 list-none p-0 max-[720px]:ml-2 max-[720px]:block" aria-label={`Integrantes de ${bot.name}`}>
          {bot.members.map((member) => (
            <li className="block border-0 p-0" key={member.id}>
              <BotRow bot={member} member selected={selectedBotId === member.id} status={statuses[member.id] ?? "available"} />
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

function BotRow({ bot, member = false, members, selected, status }: { bot: Bot; member?: boolean; members?: Bot[]; selected: boolean; status: ChatStatus }) {
  return (
    <button
      className={`relative mb-[3px] flex w-full cursor-pointer items-center gap-2.5 rounded-lg border px-2.5 text-left text-secondary hover:border-outline hover:bg-surface-raised focus-visible:border-focus focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none active:bg-surface-active max-[720px]:justify-center ${selected ? "border-outline bg-surface-raised text-primary" : "border-transparent bg-transparent"} ${member ? "py-2" : "py-2.5"}`}
      type="button"
      onClick={() => selectBot(bot.id)}
    >
      <BotAvatar bot={bot} members={members} />
      <span className="flex min-w-0 flex-1 flex-col gap-1 overflow-hidden text-ellipsis whitespace-nowrap max-[720px]:hidden">
        <strong className="text-control font-semibold text-primary">{bot.name}</strong>
        <small className="overflow-hidden text-ellipsis whitespace-nowrap text-metadata font-medium text-muted">
          <span className={`mr-1.25 inline-block size-1.5 rounded-full ${chatStatusClassNames[status]}`} />
          {chatStatusLabels[status]} · {bot.function.outcome}
        </small>
      </span>
    </button>
  )
}

function BotAvatar({ bot, members }: { bot: Bot; members?: Bot[] }) {
  if (!members || members.length === 0) {
    return (
      <Blobatar
        className="grid size-8 shrink-0 place-items-center rounded-[10px] border border-outline-strong bg-surface-raised text-support font-extrabold text-focus"
        name={`jots:${bot.id}:${bot.name}`}
        size={32}
        alt=""
      />
    )
  }

  const avatars = [bot, ...members].slice(0, 3)

  return (
    <span className="relative block h-[34px] w-10.5 min-w-10.5 shrink-0 overflow-visible" role="img" aria-label={`${bot.name} lidera ${members.length} integrantes`}>
      {avatars.map((avatar, index) => (
        <Blobatar
          className={`absolute size-6 shrink-0 rounded-[10px] border-2 border-sidebar bg-surface-raised text-support font-extrabold text-focus ${teamAvatarPositionClassNames[index]}`}
          name={`jots:${avatar.id}:${avatar.name}`}
          size={24}
          alt=""
          key={avatar.id}
        />
      ))}
    </span>
  )
}
