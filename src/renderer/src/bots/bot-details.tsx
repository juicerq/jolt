import { BoltIcon, ChevronRightIcon, ClockIcon, Cog6ToothIcon, UserGroupIcon } from "@heroicons/react/24/outline"
import type { ComponentType, SVGProps } from "react"
import type { Bot } from "@src/shared/bots"
import type { ProjectGroups } from "@src/shared/projects"
import { BrainIcon } from "../ui/brain-icon"
import { BotPage, BotPageIdentity } from "./bot-page"
import { openBotRoute, selectBot, type BotRoute } from "./bots-store"
import { teamOf } from "./team"

export function BotDetails({ bot, groups }: { bot: Bot; groups?: ProjectGroups }) {
  const { leader, members } = teamOf(groups, bot)
  const pages = [
    { name: "memory", label: "Memórias", detail: "O que este Bot aprendeu com você", icon: BrainIcon },
    ...(!bot.temporary ? [{ name: "routines" as const, label: "Rotinas", detail: "Pedidos que se repetem", icon: ClockIcon }, { name: "triggers" as const, label: "Gatilhos", detail: "Trabalho a partir dos seus serviços", icon: BoltIcon }] : []),
    ...(!bot.leaderBotId ? [{ name: "members" as const, label: "Integrantes", detail: `${members.filter((member) => !member.closed).length} no Time`, icon: UserGroupIcon }] : []),
    { name: "settings", label: "Configurações", detail: "Função, Modelo e Acessos", icon: Cog6ToothIcon },
  ] satisfies { name: Exclude<BotRoute["name"], "routine" | "trigger">; label: string; detail: string; icon: ComponentType<SVGProps<SVGSVGElement>> }[]

  return <BotPage label={`Sobre ${bot.name}`}>
    <BotPageIdentity bot={bot} />
    {leader && <button className="min-h-11 rounded-lg text-left text-control text-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" onClick={() => selectBot(leader.id)}>Integrante de <strong className="text-primary">{leader.name}</strong>. Voltar ao Líder.</button>}
    <nav className="flex flex-col divide-y divide-outline" aria-label={`Páginas de ${bot.name}`}>{pages.map((page) => <button className="flex min-h-20 items-center gap-3 rounded-lg bg-transparent px-2 py-3 text-left hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" key={page.name} onClick={() => openBotRoute({ name: page.name })}><page.icon className="size-5 shrink-0 text-secondary" /><span className="flex min-w-0 flex-1 flex-col gap-1"><strong className="text-section font-semibold text-primary">{page.label}</strong><span className="text-support text-secondary">{page.detail}</span></span><ChevronRightIcon className="size-4 text-muted" /></button>)}</nav>
  </BotPage>
}
