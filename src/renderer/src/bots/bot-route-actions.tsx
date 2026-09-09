import { BoltIcon, ChatBubbleLeftIcon, ClockIcon, Cog6ToothIcon, UserGroupIcon } from "@heroicons/react/24/outline"
import type { ReactNode } from "react"
import type { Bot } from "@src/shared/bots"
import { BrainIcon } from "../ui/brain-icon"
import { openBotRoute, type BotRoute } from "./bots-store"

type BotRouteActionName = "chat" | "settings" | "members" | "routines" | "triggers" | "memory"

interface BotRouteAction {
  name: BotRouteActionName
  label: string
  icon: ReactNode
  current: boolean
  select: () => void
}

/** The Bot's pages in edge-tab order. Choosing the current page returns to the conversation; on a Rotina, Rotinas returns to the list. */
export function botRouteActions(bot: Pick<Bot, "leaderBotId" | "temporary">, route: BotRoute): BotRouteAction[] {
  function open(name: Exclude<BotRouteActionName, "chat">) {
    if (route.name === name) {
      openBotRoute({ name: "chat" })
      return
    }

    if (name === "routines" && route.name === "routine") {
      openBotRoute({ name: "routines" })
      return
    }

    openBotRoute({ name })
  }

  return [
    { name: "chat", label: "Conversa", icon: <ChatBubbleLeftIcon aria-hidden="true" />, current: route.name === "chat", select: () => openBotRoute({ name: "chat" }) },
    { name: "settings", label: "Configurações", icon: <Cog6ToothIcon aria-hidden="true" />, current: route.name === "settings", select: () => open("settings") },
    ...(bot.leaderBotId ? [] : [{ name: "members" as const, label: "Integrantes", icon: <UserGroupIcon aria-hidden="true" />, current: route.name === "members", select: () => open("members") }]),
    ...(bot.temporary ? [] : [
      { name: "routines" as const, label: "Rotinas", icon: <ClockIcon aria-hidden="true" />, current: route.name === "routines" || route.name === "routine", select: () => open("routines") },
      { name: "triggers" as const, label: "Gatilhos", icon: <BoltIcon aria-hidden="true" />, current: route.name === "triggers" || route.name === "trigger", select: () => open("triggers") },
    ]),
    { name: "memory", label: "Memórias", icon: <BrainIcon aria-hidden="true" />, current: route.name === "memory", select: () => open("memory") },
  ]
}

