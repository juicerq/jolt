import { XMarkIcon } from "@heroicons/react/24/outline"
import { useSelector } from "@tanstack/react-store"
import { botsStore, closeMobileMenu } from "../bots/bots-store"
import type { EngineClient } from "../engine-client"
import { IconButton } from "../ui/icon-button"
import { useIsMobile } from "../ui/use-is-mobile"
import { ProjectsSidebar } from "./projects-sidebar"

export function MobileMenu({ client }: { client: EngineClient }) {
  const open = useSelector(botsStore, (state) => state.mobileMenuOpen)
  const mobile = useIsMobile()

  if (!mobile || !open) {
    return null
  }

  return (
    <dialog
      id="mobile-menu"
      aria-label="Menu principal"
      closedby="any"
      className="fixed inset-y-0 left-0 m-0 flex h-dvh max-h-none w-[min(340px,calc(100%-32px))] max-w-none flex-col border-0 border-r border-outline bg-sidebar p-0 pt-[var(--safe-top)] pb-[var(--safe-bottom)] text-primary transition-transform duration-240 ease-[cubic-bezier(0.2,0.8,0.2,1)] starting:-translate-x-full backdrop:bg-overlay motion-reduce:transition-none"
      ref={(node) => { if (node && !node.open) { node.showModal() } }}
      onCancel={(event) => { event.preventDefault(); closeMobileMenu() }}
      onClose={closeMobileMenu}
    >
      <header className="flex min-h-[60px] shrink-0 items-center justify-between border-b border-outline px-3">
        <span className="text-section font-semibold">Menu</span>
        <IconButton size={34} label="Fechar menu" onClick={closeMobileMenu}><XMarkIcon aria-hidden="true" /></IconButton>
      </header>
      <ProjectsSidebar client={client} mobile />
    </dialog>
  )
}
