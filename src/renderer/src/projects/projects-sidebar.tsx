import { Blobatar } from "@blobatar/react"
import { ChevronDownIcon, FolderIcon, MagnifyingGlassIcon, UserPlusIcon } from "@heroicons/react/24/outline"
import { useQuery } from "@tanstack/react-query"
import { useSelector } from "@tanstack/react-store"
import { useState } from "react"
import type { Bot } from "../../../shared/bots"
import type { projectSchemas } from "../../../shared/projects"
import { botsStore, openCreateBot, openCreateProject, selectBot } from "../bots/bots-store"
import { chatStore, type ChatStatus } from "../chat/chat-store"
import type { EngineClient } from "../engine-client"
import { IconButton } from "../ui/icon-button"

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

const teamAvatarHoverClassNames = [
  "group-hover/stack:-translate-y-0.5",
  "group-hover/stack:-translate-x-0.75 group-hover/stack:translate-y-0.25",
  "group-hover/stack:translate-x-0.75 group-hover/stack:translate-y-0.25",
]

export function ProjectsSidebar({ client }: { client: EngineClient }) {
  const selectedBotId = useSelector(botsStore, (state) => state.selectedBotId)
  const statuses = useSelector(chatStore, (state) => state.statuses)
  const [search, setSearch] = useState("")
  const { data, error, isPending } = useQuery(client.query.projects.list.queryOptions())
  const query = search.trim().toLocaleLowerCase("pt-BR")
  const visibleData = data && query ? filterProjects(data, query) : data
  const hasVisibleBots = !!visibleData && (visibleData.projects.length > 0 || visibleData.unassignedBots.length > 0)

  return (
    <aside className="grid min-w-0 grid-rows-[auto_minmax(0,1fr)] bg-sidebar pt-3 pr-0 pb-2.5 pl-3 max-[720px]:items-stretch max-[720px]:overflow-hidden max-[720px]:pt-2 max-[720px]:pl-2">
      <div className="mr-2 mb-3 flex min-h-9 items-center justify-between gap-2 max-[720px]:mx-0 max-[720px]:self-start max-[720px]:justify-center">
        <BotSearch value={search} onChange={setSearch} />
        <div className="flex gap-1">
          <IconButton iconSize={16} size={28} type="button" label="Criar projeto" onClick={openCreateProject}>
            <FolderIcon aria-hidden="true" />
          </IconButton>
          <IconButton iconSize={16} size={28} type="button" label="Criar bot" onClick={openCreateBot}>
            <UserPlusIcon aria-hidden="true" />
          </IconButton>
        </div>
      </div>
      {error && <p className="mx-2.5 my-3 text-support text-status-error">Falha ao carregar Projetos: {error.message}</p>}
      {isPending && <p className="mx-2.5 my-3 text-support text-secondary">Carregando Projetos...</p>}
      {data && data.projects.length === 0 && data.unassignedBots.length === 0 && (
        <SidebarEmpty title="Nenhum Bot">Crie um Bot ou Projeto para começar.</SidebarEmpty>
      )}
      {data && query && !hasVisibleBots && <SidebarEmpty title="Nenhum Bot encontrado">Tente outro nome ou função.</SidebarEmpty>}
      {visibleData && hasVisibleBots && (
        <nav className="min-h-0 overflow-x-hidden overflow-y-auto pr-2 max-[720px]:block" aria-label="Projetos e Bots">
          {visibleData.projects.map((project) => (
            <section className="[&+&]:mt-5" key={project.id} aria-labelledby={`project-${project.id}`}>
              <ProjectHeading id={`project-${project.id}`}>{project.name}</ProjectHeading>
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
          {visibleData.unassignedBots.length > 0 && (
            <section className="border-t border-outline pt-4 [&+&]:mt-5" aria-labelledby="unassigned-bots">
              <ProjectHeading id="unassigned-bots">Sem projeto</ProjectHeading>
              <ul className="m-0 list-none p-0 max-[720px]:block">
                {visibleData.unassignedBots.map((bot) => (
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

function SidebarEmpty({ children, title }: { children: string; title: string }) {
  return (
    <div className="flex min-h-45 flex-col items-center justify-center gap-1.5 text-center text-support text-secondary">
      <strong className="text-section font-semibold text-primary">{title}</strong>
      <span>{children}</span>
    </div>
  )
}

function ProjectHeading({ children, id }: { children: string; id: string }) {
  return (
    <div className="flex items-center justify-between gap-2 px-2.5 pb-1.5 max-[720px]:hidden">
      <h3 className="m-0 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-metadata font-semibold tracking-[0.08em] text-muted uppercase" id={id}>
        {children}
      </h3>
    </div>
  )
}

function BotSearch({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="relative flex min-w-0 flex-1 items-center max-[720px]:hidden">
      <MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 size-[15px] text-muted" aria-hidden="true" />
      <input
        className="box-border h-8 w-full rounded-lg border border-outline bg-canvas py-0 pr-2.5 pl-8 text-control text-primary placeholder:text-muted hover:border-outline-strong focus-visible:border-focus focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
        type="search"
        aria-label="Buscar Bots"
        placeholder="Buscar Bots"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

function filterProjects(data: typeof projectSchemas.groupedList.infer, query: string) {
  const filterBots = (bots: (Bot & { members: Bot[] })[]) => bots.flatMap((bot) => {
    const leaderMatches = matchesSearch(bot, query)
    const matchingMembers = bot.members.filter((member) => matchesSearch(member, query))

    if (!leaderMatches && matchingMembers.length === 0) {
      return []
    }

    return [{ ...bot, members: leaderMatches ? bot.members : matchingMembers }]
  })

  return {
    projects: data.projects
      .map((project) => ({ ...project, bots: filterBots(project.bots) }))
      .filter((project) => project.bots.length > 0),
    unassignedBots: filterBots(data.unassignedBots),
  }
}

function matchesSearch(bot: Bot, query: string) {
  return `${bot.name} ${bot.function.outcome}`.toLocaleLowerCase("pt-BR").includes(query)
}

function BotGroup({ bot, selectedBotId, statuses }: { bot: Bot & { members: Bot[] }; selectedBotId: string | null; statuses: Record<string, ChatStatus | undefined> }) {
  const hasTeam = bot.members.length > 0
  const [expanded, setExpanded] = useState(hasTeam)
  const memberListId = `team-members-${bot.id}`

  if (!hasTeam) {
    return <li className="block border-0 p-0"><BotRow bot={bot} selected={selectedBotId === bot.id} status={statuses[bot.id] ?? "available"} /></li>
  }

  return (
    <li className="mb-2 block border-0 p-0">
      <div className="group/leader relative">
        <BotRow bot={bot} members={expanded ? undefined : bot.members} teamLeader selected={selectedBotId === bot.id} status={statuses[bot.id] ?? "available"} />
        <IconButton
          className="top-1/2 right-2 z-20 -translate-y-1/2 opacity-0 transition-[color,opacity] duration-[120ms] group-hover/leader:opacity-100 focus-visible:opacity-100"
          iconSize={13}
          position="absolute"
          size={24}
          type="button"
          label={expanded ? `Recolher time de ${bot.name}` : `Expandir time de ${bot.name}`}
          aria-expanded={expanded}
          aria-controls={memberListId}
          onClick={() => setExpanded((current) => !current)}
        >
          <ChevronDownIcon className={`transition-transform duration-150 ease-out motion-reduce:transition-none ${expanded ? "rotate-180" : "rotate-0"}`} aria-hidden="true" />
        </IconButton>
      </div>
      <div
        className={`grid transition-[grid-template-rows,opacity] duration-[160ms] ease-out motion-reduce:transition-none ${expanded ? "grid-rows-[1fr] overflow-visible opacity-100" : "pointer-events-none grid-rows-[0fr] overflow-hidden opacity-0"}`}
        id={memberListId}
        aria-hidden={!expanded}
        inert={!expanded ? true : undefined}
      >
        <ul className="relative mx-2 mt-0 mb-0 ml-5.5 min-h-0 min-w-0 list-none overflow-hidden py-0.5 pr-0 pl-2.5 max-[720px]:ml-2" aria-label={`Integrantes de ${bot.name}`}>
          {bot.members.map((member) => (
            <li
              className="relative block border-0 p-0 before:absolute before:top-[-2px] before:bottom-1/2 before:left-[-10px] before:w-2 before:rounded-bl before:border-b before:border-l before:border-outline before:content-[''] after:absolute after:top-1/2 after:bottom-[-2px] after:left-[-10px] after:w-px after:bg-outline after:content-[''] last:after:hidden"
              key={member.id}
            >
              <BotRow bot={member} member selected={selectedBotId === member.id} status={statuses[member.id] ?? "available"} />
            </li>
          ))}
        </ul>
      </div>
    </li>
  )
}

function BotRow({ bot, member = false, members, selected, status, teamLeader = false }: { bot: Bot; member?: boolean; members?: Bot[]; selected: boolean; status: ChatStatus; teamLeader?: boolean }) {
  const avatarSizeClassName = members?.length ? "h-[34px] w-10.5 min-w-10.5" : teamLeader ? "h-[34px] w-10.5 min-w-10.5 items-center justify-center" : "size-8 min-w-8"
  const selectionClassName = selected ? "border-outline bg-surface-raised text-primary" : "border-transparent bg-transparent text-secondary"

  return (
    <button
      className={`group/row relative mb-[3px] flex w-full items-center gap-2.5 rounded-lg border px-2.5 text-left hover:border-outline hover:bg-surface-raised focus-visible:border-focus focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none active:bg-surface-active disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-transparent disabled:hover:bg-transparent max-[720px]:justify-center ${selectionClassName} ${member ? "py-2" : "py-2.5"} ${teamLeader ? "pr-9.5" : ""}`}
      type="button"
      onClick={() => selectBot(bot.id)}
    >
      <span className={`group/avatar relative z-10 flex shrink-0 flex-row gap-0 overflow-visible whitespace-normal ${avatarSizeClassName}`} role="img" aria-label={`Status: ${chatStatusLabels[status]}`}>
        <BotAvatar bot={bot} members={members} />
        <span className={`absolute right-[-2px] bottom-[-2px] z-5 size-[7px] rounded-full ${chatStatusClassNames[status]}`} aria-hidden="true" />
        <span
          className="pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 z-[100] w-max max-w-55 translate-x-[-50%] translate-y-0.5 rounded-lg border border-outline bg-surface-active px-2 py-1.5 text-center text-metadata font-medium whitespace-normal text-primary opacity-0 shadow-[0_8px_24px_rgb(0_0_0/24%)] transition-[opacity,transform] duration-[120ms] ease-out group-hover/avatar:translate-y-0 group-hover/avatar:opacity-100 group-focus-visible/row:translate-y-0 group-focus-visible/row:opacity-100 motion-reduce:transition-none"
          aria-hidden="true"
        >
          {chatStatusLabels[status]}
        </span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1 overflow-hidden text-ellipsis whitespace-nowrap max-[720px]:hidden">
        <strong className="text-control font-semibold text-primary">{bot.name}</strong>
        <small className="overflow-hidden text-ellipsis whitespace-nowrap text-metadata font-medium text-muted">{bot.function.outcome}</small>
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
    <span className="group/stack relative block h-[34px] w-10.5 min-w-10.5 shrink-0 overflow-visible" role="img" aria-label={`${bot.name} lidera ${members.length} integrantes`}>
      {avatars.map((avatar, index) => (
        <Blobatar
          className={`absolute size-6 shrink-0 rounded-[10px] border border-outline-strong bg-surface-raised text-support font-extrabold text-focus transition-transform duration-[160ms] ease-out motion-reduce:transition-none ${teamAvatarPositionClassNames[index]} ${teamAvatarHoverClassNames[index]}`}
          name={`jots:${avatar.id}:${avatar.name}`}
          size={24}
          alt=""
          key={avatar.id}
        />
      ))}
    </span>
  )
}
