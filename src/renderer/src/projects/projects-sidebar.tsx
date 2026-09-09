import { ArrowPathIcon, BookmarkIcon, LinkSlashIcon, TrashIcon, ChevronDownIcon, Cog6ToothIcon, FolderIcon, MagnifyingGlassIcon, PlusIcon, PuzzlePieceIcon, UserPlusIcon } from "@heroicons/react/24/outline"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useSelector } from "@tanstack/react-store"
import { type ReactNode, type Ref, useId, useState } from "react"
import type { Bot } from "@src/shared/bots"
import type { ProjectGroups } from "@src/shared/projects"
import { ContextMenu } from "../ui/context-menu"
import { botRouteActions } from "../bots/bot-route-actions"
import { BotDetachDialog } from "../bots/bot-detach-member"
import { teamOf } from "../bots/team"
import { BotRemovalDialog } from "../bots/bot-removal-dialog"
import { BotFace } from "../bots/bot-face"
import { groupMembers } from "../bots/bot-members"
import { botDraftAvatarSeed, type BotDraft, botsStore, openCreateBot, openCreateTeamBot, openCreateProject, openPlugins, openSettings, openBotRoute, selectBot } from "../bots/bots-store"
import { chatControlAnchor } from "../chat/chat-control-menu"
import { chatStatusClassNames, chatStatusLabels } from "../chat/chat-status"
import { chatStore, type ChatStatus } from "../chat/chat-store"
import type { EngineClient } from "../engine-client"
import { appUpdateStore } from "../settings/app-update-store"
import { Button } from "../ui/button"
import { IconButton } from "../ui/icon-button"
import { InlineAction } from "../ui/inline-action"
import { menuCardClassName, MenuOption } from "../ui/menu"
import { Tooltip, useTooltip } from "../ui/tooltip"

const teamAvatarPositionClassNames = ["top-0 left-[11px] z-1", "bottom-0 left-0 z-2", "right-0 bottom-0 z-3"]
type TogglePinned = (bot: Bot) => void

const teamAvatarHoverClassNames = [
  "group-hover/stack:-translate-y-0.5",
  "group-hover/stack:-translate-x-0.75 group-hover/stack:translate-y-0.25",
  "group-hover/stack:translate-x-0.75 group-hover/stack:translate-y-0.25",
]

export function ProjectsSidebar({ client, mobile = false }: { client: EngineClient; mobile?: boolean }) {
  const draft = useSelector(botsStore, (state) => state.draft)
  const pluginsOpen = useSelector(botsStore, (state) => state.screen === "plugins")
  const settingsOpen = useSelector(botsStore, (state) => state.screen === "settings")
  const [search, setSearch] = useState("")

  return (
    <aside className={`flex min-h-0 min-w-0 flex-col bg-sidebar pt-3 pb-2.5 pl-3 ${mobile ? "flex-1 pr-3" : "pr-0 max-md:hidden"}`}>
      <div className="mb-3 flex min-h-9 items-center justify-between gap-2">
        <BotSearch value={search} onChange={setSearch} />
        <CreateMenu />
      </div>
      {draft && <DraftRow draft={draft} />}
      <SidebarProjects client={client} search={search} />
      <div className="mt-auto flex flex-col gap-1 pt-2">
        <SidebarUpdateButton />
        <SidebarNavButton active={pluginsOpen} icon={<PuzzlePieceIcon className="size-4 shrink-0" aria-hidden="true" />} label="Plugins" onClick={openPlugins} />
        <SidebarNavButton active={settingsOpen} icon={<Cog6ToothIcon className="size-4 shrink-0" aria-hidden="true" />} label="Configurações" onClick={openSettings} />
      </div>
    </aside>
  )
}

function SidebarProjects({ client, search }: { client: EngineClient; search: string }) {
  const selectedBotId = useSelector(botsStore, (state) => (state.draft === null && state.screen === null ? state.selectedBotId : null))
  const draftOpen = useSelector(botsStore, (state) => state.draft !== null)
  const statuses = useSelector(chatStore, (state) => state.statuses)
  const queryClient = useQueryClient()
  const { data, error, isPending } = useQuery(client.query.projects.list.queryOptions())
  const { mutate: updatePinned, variables: pinning, isPending: pinningPending, error: pinError } = useMutation(client.query.bots.updatePinned.mutationOptions({
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: client.query.projects.list.queryOptions().queryKey })
    },
  }))

  function togglePinned(bot: Bot) {
    updatePinned({ id: bot.id, pinned: !bot.pinned })
  }

  return <SidebarProjectContent
    client={client}
    data={data}
    error={error}
    isPending={isPending}
    search={search}
    draftOpen={draftOpen}
    selectedBotId={selectedBotId}
    statuses={statuses}
    pinningBotId={pinningPending ? pinning?.id : undefined}
    pinError={pinError}
    onTogglePinned={togglePinned}
  />
}

function SidebarProjectContent({ client, data, error, isPending, search, draftOpen, selectedBotId, statuses, pinningBotId, pinError, onTogglePinned }: { client: EngineClient; data: ProjectGroups | undefined; error: Error | null; isPending: boolean; search: string; draftOpen: boolean; selectedBotId: string | null; statuses: Record<string, ChatStatus | undefined>; pinningBotId?: string; pinError: Error | null; onTogglePinned: TogglePinned }) {
  const [detachingBot, setDetachingBot] = useState<Bot | null>(null)
  const [removingBot, setRemovingBot] = useState<Bot | null>(null)

  if (error) {
    return <p className="mx-2.5 my-3 text-support text-status-error">Falha ao carregar Projetos: {error.message}</p>
  }

  if (isPending) {
    return <p className="mx-2.5 my-3 text-support text-secondary">Carregando Projetos...</p>
  }

  if (!data) {
    return null
  }

  return <SidebarProjectResults client={client} data={data} search={search} draftOpen={draftOpen} selectedBotId={selectedBotId} statuses={statuses} pinningBotId={pinningBotId} pinError={pinError} onTogglePinned={onTogglePinned} detachingBot={detachingBot} removingBot={removingBot} onDetach={setDetachingBot} onRemove={setRemovingBot} />
}

function SidebarProjectResults({ client, data, search, draftOpen, selectedBotId, statuses, pinningBotId, pinError, onTogglePinned, detachingBot, removingBot, onDetach, onRemove }: { client: EngineClient; data: ProjectGroups; search: string; draftOpen: boolean; selectedBotId: string | null; statuses: Record<string, ChatStatus | undefined>; pinningBotId?: string; pinError: Error | null; onTogglePinned: TogglePinned; detachingBot: Bot | null; removingBot: Bot | null; onDetach: (bot: Bot | null) => void; onRemove: (bot: Bot | null) => void }) {
  const hasBots = data.projects.length > 0 || data.unassignedBots.length > 0

  if (!hasBots && draftOpen) {
    return null
  }

  if (!hasBots) {
    return <SidebarEmpty title="Nenhum Bot"><InlineAction type="button" onClick={openCreateBot}>Crie um Bot</InlineAction> ou Projeto para começar.</SidebarEmpty>
  }

  const query = search.trim().toLocaleLowerCase("pt-BR")
  const visibleData = query ? filterProjects(data, query) : data

  if (visibleData.projects.length === 0 && visibleData.unassignedBots.length === 0) {
    return <SidebarEmpty title="Nenhum Bot encontrado">Tente outro nome ou função.</SidebarEmpty>
  }

  const { pinnedBots, projects, unassignedBots } = splitPinnedBots(visibleData)
  const detachLeader = detachingBot ? teamOf(data, detachingBot).leader : undefined

  return <SidebarProjectList client={client} pinnedBots={pinnedBots} projects={projects} unassignedBots={unassignedBots} selectedBotId={selectedBotId} statuses={statuses} pinningBotId={pinningBotId} pinError={pinError} onTogglePinned={onTogglePinned} detachingBot={detachingBot} detachLeader={detachLeader} removingBot={removingBot} onDetach={onDetach} onRemove={onRemove} />
}

function SidebarProjectList({ client, pinnedBots, projects, unassignedBots, selectedBotId, statuses, pinningBotId, pinError, onTogglePinned, detachingBot, detachLeader, removingBot, onDetach, onRemove }: { client: EngineClient; pinnedBots: (Bot & { members: Bot[] })[]; projects: ProjectGroups["projects"]; unassignedBots: (Bot & { members: Bot[] })[]; selectedBotId: string | null; statuses: Record<string, ChatStatus | undefined>; pinningBotId?: string; pinError: Error | null; onTogglePinned: TogglePinned; detachingBot: Bot | null; detachLeader: Bot | undefined; removingBot: Bot | null; onDetach: (bot: Bot | null) => void; onRemove: (bot: Bot | null) => void }) {
  return (
    <nav className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto max-[720px]:block" aria-label="Projetos e Bots">
      {detachingBot && detachLeader && <BotDetachDialog bot={detachingBot} leader={detachLeader} client={client} onClose={() => onDetach(null)} />}
      {removingBot && <BotRemovalDialog bot={removingBot} client={client} onClose={() => onRemove(null)} />}
      {pinError && <p className="mx-2.5 my-3 text-support text-status-error" role="alert">Não foi possível atualizar o Bot: {pinError.message}</p>}
      {pinnedBots.length > 0 && (
        <section className="[&+&]:mt-5" aria-labelledby="pinned-bots">
          <ProjectHeading id="pinned-bots">Fixados</ProjectHeading>
          <ul className="m-0 list-none p-0 max-[720px]:block">
            {pinnedBots.map((bot) => (
              <BotGroup bot={bot} key={bot.id} selectedBotId={selectedBotId} statuses={statuses} pinningBotId={pinningBotId} onTogglePinned={onTogglePinned} onRemove={onRemove} onDetach={onDetach} />
            ))}
          </ul>
        </section>
      )}
      {projects.map((project) => <ProjectSection key={project.id} project={project} selectedBotId={selectedBotId} statuses={statuses} pinningBotId={pinningBotId} onTogglePinned={onTogglePinned} onRemove={onRemove} onDetach={onDetach} />)}
      {unassignedBots.length > 0 && (
        <section className="[&+&]:mt-5 [&+&]:border-t [&+&]:border-outline [&+&]:pt-4" aria-label="Sem projeto">
          {(projects.length > 0 || pinnedBots.length > 0) && <ProjectHeading id="unassigned-bots">Sem projeto</ProjectHeading>}
          <ul className="m-0 list-none p-0 max-[720px]:block">
            {unassignedBots.map((bot) => (
              <BotGroup bot={bot} key={bot.id} selectedBotId={selectedBotId} statuses={statuses} pinningBotId={pinningBotId} onTogglePinned={onTogglePinned} onRemove={onRemove} onDetach={onDetach} />
            ))}
          </ul>
        </section>
      )}
    </nav>
  )
}

function ProjectSection({ project, selectedBotId, statuses, pinningBotId, onTogglePinned, onRemove, onDetach }: { project: ProjectGroups["projects"][number]; selectedBotId: string | null; statuses: Record<string, ChatStatus | undefined>; pinningBotId?: string; onTogglePinned: TogglePinned; onRemove: (bot: Bot) => void; onDetach: (bot: Bot) => void }) {
  return (
    <section className="[&+&]:mt-5" aria-labelledby={`project-${project.id}`}>
      <ProjectHeading id={`project-${project.id}`}>{project.name}</ProjectHeading>
      {project.bots.length === 0 ? (
        <p className="m-0 px-2.5 pt-[7px] pb-[9px] text-support text-muted">Nenhum Bot</p>
      ) : (
        <ul className="m-0 list-none p-0 max-[720px]:block">
          {project.bots.map((bot) => (
            <BotGroup bot={bot} key={bot.id} selectedBotId={selectedBotId} statuses={statuses} pinningBotId={pinningBotId} onTogglePinned={onTogglePinned} onRemove={onRemove} onDetach={onDetach} />
          ))}
        </ul>
      )}
    </section>
  )
}

const createPopoverClassName = `${menuCardClassName} chat-control-popover inset-auto mt-1 [position-area:bottom_span-left] [position-try-fallbacks:flip-block,flip-inline]`

/** A "+" that opens Novo Bot / Novo Projeto: a dropdown on desktop, a sheet on mobile. */
export function CreateMenu({ size = 28 }: { size?: 28 | 34 }) {
  const draftOpen = useSelector(botsStore, (state) => state.draft !== null)
  const popoverId = `create-${useId().replace(/[^a-zA-Z0-9-]/g, "")}`
  const anchor = chatControlAnchor(popoverId)

  return (
    <>
      <span className="grid" style={anchor.trigger}>
        <IconButton className={draftOpen ? "bg-surface-active text-primary" : ""} iconSize={16} size={size} type="button" label="Criar" aria-pressed={draftOpen} popoverTarget={popoverId}>
          <PlusIcon aria-hidden="true" />
        </IconButton>
      </span>
      <div className={createPopoverClassName} id={popoverId} popover="auto" aria-label="Criar" style={anchor.popover}>
        <MenuOption icon={<UserPlusIcon className="size-4 shrink-0 text-muted" aria-hidden="true" />} label="Novo Bot" selected={false} onSelect={openCreateBot} />
        <MenuOption icon={<FolderIcon className="size-4 shrink-0 text-muted" aria-hidden="true" />} label="Novo Projeto" selected={false} onSelect={openCreateProject} />
      </div>
    </>
  )
}

function SidebarUpdateButton() {
  const updateReady = useSelector(appUpdateStore, (state) => state.updateReady)

  if (!updateReady) {
    return null
  }

  return (
    <Button className="flex h-9 w-full items-center gap-2.5 px-2.5 py-0 max-md:h-11" type="button" onClick={() => window.desktop.installUpdate()}>
      <ArrowPathIcon className="size-4 shrink-0" aria-hidden="true" />
      Atualizar e reiniciar
    </Button>
  )
}

function SidebarNavButton({ active, icon, label, onClick }: { active: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      className={`flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-control font-medium transition-colors duration-150 hover:bg-surface-hover hover:text-primary focus-visible:bg-surface-hover focus-visible:text-primary focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none active:bg-surface-active ${active ? "bg-surface-raised text-primary" : "bg-transparent text-muted"}`}
      type="button"
      aria-pressed={active}
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  )
}

function DraftRow({ draft }: { draft: BotDraft }) {
  return (
    <div className="mb-0.5 flex items-center gap-2.5 rounded-lg border border-outline bg-surface-raised px-2.5 py-2.5 text-primary" aria-current="true">
      <BotFace className="size-[38px] min-w-[38px]" name={botDraftAvatarSeed(draft)} size={38} />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <strong className="overflow-hidden text-ellipsis whitespace-nowrap text-control font-semibold text-primary">{draft.name || "Novo Bot"}</strong>
        <small className="text-metadata font-medium text-muted">Em rascunho</small>
      </span>
    </div>
  )
}

function SidebarEmpty({ children, title }: { children: ReactNode; title: string }) {
  return (
    <div className="flex min-h-45 flex-col items-center justify-center gap-1.5 text-center text-support text-secondary">
      <strong className="text-section font-semibold text-primary">{title}</strong>
      <span>{children}</span>
    </div>
  )
}

function ProjectHeading({ children, id }: { children: string; id: string }) {
  return (
    <div className="flex items-center justify-between gap-2 px-2.5 pb-1.5">
      <h3 className="m-0 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-metadata font-semibold tracking-[0.08em] text-muted uppercase" id={id}>
        {children}
      </h3>
    </div>
  )
}

export function BotSearch({ value, onChange, ref }: { value: string; onChange: (value: string) => void; ref?: Ref<HTMLInputElement> }) {
  return (
    <label className="relative flex min-w-0 flex-1 items-center">
      <MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 size-[15px] text-muted" aria-hidden="true" />
      <input
        className="box-border h-8 w-full rounded-lg border border-outline bg-canvas py-0 pr-2.5 pl-8 text-control text-primary placeholder:text-muted hover:border-outline-strong focus-visible:border-focus focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none max-md:h-9 max-md:text-base"
        type="search"
        aria-label="Buscar Bots"
        placeholder="Buscar Bots"
        ref={ref}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

function filterProjects(data: ProjectGroups, query: string) {
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

function splitPinnedBots(data: ProjectGroups) {
  const pinnedBots: (Bot & { members: Bot[] })[] = []
  const split = (bots: (Bot & { members: Bot[] })[]) => bots.flatMap((bot) => {
    if (bot.pinned) {
      pinnedBots.push(bot)

      return []
    }

    const pinnedMembers = bot.members.filter((member) => member.pinned).map((member) => ({ ...member, members: [] }))
    pinnedBots.push(...pinnedMembers)

    return [{ ...bot, members: bot.members.filter((member) => !member.pinned) }]
  })
  const projects = data.projects.flatMap((project) => {
    const bots = split(project.bots)

    if (project.bots.length > 0 && bots.length === 0) {
      return []
    }

    return [{ ...project, bots }]
  })

  return { pinnedBots, projects, unassignedBots: split(data.unassignedBots) }
}

function BotGroup({ bot, selectedBotId, statuses, pinningBotId, onTogglePinned, onRemove, onDetach }: { bot: Bot & { members: Bot[] }; selectedBotId: string | null; statuses: Record<string, ChatStatus | undefined>; pinningBotId?: string; onTogglePinned: TogglePinned; onRemove: (bot: Bot) => void; onDetach: (bot: Bot) => void }) {
  const hasTeam = bot.members.length > 0
  const [expanded, setExpanded] = useState(hasTeam)
  const [closedShown, setClosedShown] = useState(false)
  const memberListId = `team-members-${bot.id}`
  const closedListId = `team-closed-${bot.id}`
  const groups = groupMembers(bot.members)
  const openMembers = [...groups.permanent, ...groups.active]
  const memberSelected = bot.members.some((member) => member.id === selectedBotId)
  const highlighted = !expanded && memberSelected ? bot.id : selectedBotId

  if (!hasTeam) {
    return <li className="block border-0 p-0"><BotRow bot={bot} selected={selectedBotId === bot.id} status={statuses[bot.id] ?? "available"} pinning={pinningBotId === bot.id} onTogglePinned={onTogglePinned} onRemove={onRemove} onDetach={onDetach} /></li>
  }

  return (
    <li className="block border-0 p-0">
      <div className="group/leader relative">
        <BotRow bot={bot} members={expanded ? undefined : openMembers} teamLeader selected={highlighted === bot.id} status={statuses[bot.id] ?? "available"} pinning={pinningBotId === bot.id} onTogglePinned={onTogglePinned} onRemove={onRemove} onDetach={onDetach} />
        <IconButton
          className="top-1/2 right-2 z-20 -translate-y-1/2 opacity-0 transition-[color,opacity] duration-[120ms] group-hover/leader:opacity-100 focus-visible:opacity-100 max-md:opacity-100"
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
        <ul className={`${memberListClassName} ${expanded ? "py-0.5" : "py-0"}`} id={closedListId} aria-label={`Integrantes de ${bot.name}`}>
          {openMembers.map((member) => <MemberItem key={member.id} member={member} selected={highlighted === member.id} status={statuses[member.id] ?? "available"} pinning={pinningBotId === member.id} onTogglePinned={onTogglePinned} onRemove={onRemove} onDetach={onDetach} />)}
          {groups.closed.length > 0 && (
            <li className={memberItemClassName}>
              <button className="mb-0.5 flex w-full cursor-pointer items-center gap-1.5 rounded-lg border border-transparent bg-transparent px-2.5 py-1.5 text-left text-metadata font-medium text-muted hover:text-primary focus-visible:border-focus focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" type="button" aria-expanded={closedShown} aria-controls={closedListId} onClick={() => setClosedShown((current) => !current)}>
                Encerrados
                <ChevronDownIcon className={`size-3 transition-transform duration-150 ease-out motion-reduce:transition-none ${closedShown ? "rotate-180" : "rotate-0"}`} aria-hidden="true" />
              </button>
            </li>
          )}
          {closedShown && groups.closed.map((member) => <MemberItem key={member.id} member={member} selected={highlighted === member.id} pinning={pinningBotId === member.id} onTogglePinned={onTogglePinned} onRemove={onRemove} onDetach={onDetach} />)}
        </ul>
      </div>
    </li>
  )
}

const memberListClassName = "relative mx-2 mt-0 mb-0 ml-5.5 min-h-0 min-w-0 list-none overflow-hidden pr-0 pl-2.5"
const memberItemClassName = "relative block border-0 p-0 before:absolute before:top-[-2px] before:bottom-1/2 before:left-[-10px] before:w-2 before:rounded-bl before:border-b before:border-l before:border-outline before:content-[''] after:absolute after:top-1/2 after:bottom-[-2px] after:left-[-10px] after:w-px after:bg-outline after:content-[''] last:after:hidden"

function MemberItem({ member, selected, status, pinning, onTogglePinned, onRemove, onDetach }: { member: Bot; selected: boolean; status?: ChatStatus; pinning: boolean; onTogglePinned: TogglePinned; onRemove: (bot: Bot) => void; onDetach: (bot: Bot) => void }) {
  return (
    <li className={`${memberItemClassName}${member.closed ? " opacity-60" : ""}`}>
      <BotRow bot={member} member selected={selected} status={status} pinning={pinning} onTogglePinned={onTogglePinned} onRemove={onRemove} onDetach={onDetach} />
    </li>
  )
}

function describeMember(bot: Bot) {
  if (bot.temporary && !bot.closed) {
    return `Temporário · ${bot.function.outcome}`
  }

  return bot.function.outcome
}

function BotRow({ bot, member = false, members, selected, status, teamLeader = false, pinning, onTogglePinned, onRemove, onDetach }: { bot: Bot; member?: boolean; members?: Bot[]; selected: boolean; status?: ChatStatus; teamLeader?: boolean; pinning: boolean; onTogglePinned: TogglePinned; onRemove: (bot: Bot) => void; onDetach: (bot: Bot) => void }) {
  const avatarSizeClassName = members?.length ? "h-[41px] w-[51px] min-w-[51px]" : "size-[38px] min-w-[38px]"
  const selectionClassName = selected ? "border-outline bg-surface-raised text-primary" : "border-transparent bg-transparent text-secondary"
  const tooltip = useTooltip()
  const actions = [
    ...botRouteActions(bot, { name: "chat" }).map((action) => ({ label: action.label, icon: action.icon, onSelect: () => { selectBot(bot.id); openBotRoute({ name: action.name }) } })),
    { label: bot.pinned ? "Desafixar" : "Fixar", icon: <BookmarkIcon />, separatorBefore: true, disabled: pinning, onSelect: () => onTogglePinned(bot) },
    { label: "Novo Bot nesse time", icon: <UserPlusIcon />, onSelect: () => openCreateTeamBot(bot) },
    ...(!bot.temporary ? [
      { label: "Nova Rotina", icon: <PlusIcon />, onSelect: () => { selectBot(bot.id); openBotRoute({ name: "routine", id: "new" }) } },
    ] : []),
    ...(bot.leaderBotId && !bot.temporary ? [{ label: "Desvincular do time", icon: <LinkSlashIcon />, onSelect: () => onDetach(bot) }] : []),
    { label: "Excluir Bot", icon: <TrashIcon />, separatorBefore: true, danger: true, onSelect: () => onRemove(bot) },
  ]

  return (
    <ContextMenu label={`Ações de ${bot.name}`} actions={actions}>{() => (
      <button
        className={`group/row relative mb-0.5 flex w-full items-center gap-2.5 rounded-lg border px-2.5 text-left hover:border-outline hover:bg-surface-raised focus-visible:border-focus focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none active:bg-surface-active disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-transparent disabled:hover:bg-transparent ${selectionClassName} ${member ? "py-2" : "py-2.5"} ${teamLeader ? "pr-9.5" : ""}`}
        type="button"
        aria-current={selected ? "true" : undefined}
        onClick={() => selectBot(bot.id)}
        {...tooltip.focusProps}
      >
        <span {...tooltip.anchorProps} className={`relative z-10 flex shrink-0 flex-row gap-0 overflow-visible whitespace-normal ${avatarSizeClassName}`} role={status && "img"} aria-label={status && `Status: ${chatStatusLabels[status]}`}>
          <span className="relative flex shrink-0">
            <BotAvatar bot={bot} members={members} />
            {status && <span className={`absolute right-0.5 bottom-0.5 z-5 size-[7px] rounded-full ${chatStatusClassNames[status]}`} aria-hidden="true" />}
          </span>
        </span>
        {status && <Tooltip {...tooltip.popoverProps}>{chatStatusLabels[status]}</Tooltip>}
        <span className="flex min-w-0 flex-1 flex-col gap-1 overflow-hidden">
          <strong className="overflow-hidden text-ellipsis whitespace-nowrap text-control font-semibold text-primary">{bot.name}</strong>
          <small className="overflow-hidden text-ellipsis whitespace-nowrap text-metadata font-medium text-muted">{describeMember(bot)}</small>
        </span>
      </button>
    )}</ContextMenu>
  )
}

function BotAvatar({ bot, members }: { bot: Bot; members?: Bot[] }) {
  if (!members || members.length === 0) {
    return (
      <BotFace
        className="grid size-[38px] shrink-0 place-items-center text-support font-extrabold text-focus"
        name={bot.avatarSeed}
        botId={bot.id}
        size={38}
      />
    )
  }

  const avatars = [bot, ...members].slice(0, 3)

  return (
    <span className="group/stack relative block h-[41px] w-[51px] min-w-[51px] shrink-0 overflow-visible" role="img" aria-label={`${bot.name} lidera ${members.length} integrantes`}>
      {avatars.map((avatar, index) => (
        <BotFace
          className={`absolute size-[29px] shrink-0 text-support font-extrabold text-focus transition-transform duration-[160ms] ease-out motion-reduce:transition-none ${teamAvatarPositionClassNames[index]} ${teamAvatarHoverClassNames[index]}`}
          name={avatar.avatarSeed}
          botId={avatar.id}
          size={29}
          key={avatar.id}
        />
      ))}
    </span>
  )
}
