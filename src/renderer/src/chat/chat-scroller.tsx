import { ArrowDownIcon } from "@heroicons/react/24/outline"
import { type ClipboardEvent, type PropsWithChildren, type ReactNode, startTransition, type UIEvent, useCallback, useRef, useState } from "react"
import { getChatScrollMode } from "./chat-scroll"

const scrollAnchoringMinimumTop = 1
const revealDistance = 600

export function ChatScroller({ children, footer, onRevealEarlier }: PropsWithChildren<{ footer: ReactNode; onRevealEarlier?: () => Promise<void> }>) {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const mutationObserverRef = useRef<MutationObserver | null>(null)
  const frameRef = useRef<number | null>(null)
  const shouldFollowRef = useRef(true)
  const revealingRef = useRef(false)
  const revealRef = useRef<(() => Promise<void>) | undefined>(undefined)
  const [showEndButton, setShowEndButton] = useState(false)

  revealRef.current = onRevealEarlier

  const revealEarlier = useCallback((viewport: HTMLDivElement) => {
    const reveal = revealRef.current

    if (!reveal || revealingRef.current || viewport.scrollTop >= revealDistance) {
      return
    }

    revealingRef.current = true

    if (viewport.scrollHeight > viewport.clientHeight) {
      viewport.scrollTop = Math.max(viewport.scrollTop, scrollAnchoringMinimumTop)
      shouldFollowRef.current = false
    }

    startTransition(async () => {
      await reveal()
      revealingRef.current = false
    })
  }, [])

  const connectObserver = useCallback(() => {
    resizeObserverRef.current?.disconnect()
    mutationObserverRef.current?.disconnect()

    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }

    const content = contentRef.current

    if (!content || !viewportRef.current) {
      return
    }

    function scheduleReconciliation() {
      if (frameRef.current !== null) {
        return
      }

      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null

        const viewport = viewportRef.current

        if (!viewport) {
          return
        }

        if (viewport.scrollHeight <= viewport.clientHeight) {
          revealEarlier(viewport)
        }

        const distanceFromEnd = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight
        const contentIsNearEnd = getChatScrollMode(distanceFromEnd) === "follow"

        if (shouldFollowRef.current || contentIsNearEnd) {
          shouldFollowRef.current = true
          setShowEndButton(false)
          viewport.scrollTo({ top: viewport.scrollHeight })
          return
        }

        setShowEndButton(true)
        revealEarlier(viewport)
      })
    }

    resizeObserverRef.current = new ResizeObserver(scheduleReconciliation)
    resizeObserverRef.current.observe(content)
    resizeObserverRef.current.observe(viewportRef.current)
    mutationObserverRef.current = new MutationObserver(scheduleReconciliation)
    mutationObserverRef.current.observe(content, { childList: true, characterData: true, subtree: true })
  }, [revealEarlier])

  const attachViewport = useCallback((viewport: HTMLDivElement | null) => {
    viewportRef.current = viewport
    connectObserver()
  }, [connectObserver])

  const attachContent = useCallback((content: HTMLDivElement | null) => {
    contentRef.current = content
    connectObserver()
  }, [connectObserver])

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    const viewport = event.currentTarget
    const distanceFromEnd = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight
    const shouldFollow = getChatScrollMode(distanceFromEnd) === "follow"

    shouldFollowRef.current = shouldFollow
    setShowEndButton(!shouldFollow)
    revealEarlier(viewport)
  }

  function handleGoToEnd() {
    const viewport = viewportRef.current

    if (!viewport) {
      return
    }

    shouldFollowRef.current = true
    setShowEndButton(false)
    viewport.scrollTo({ top: viewport.scrollHeight })
  }

  function handleCopy(event: ClipboardEvent<HTMLDivElement>) {
    const text = getSelection()?.toString().replace(/\n{3,}/g, "\n\n").trim()

    if (!text) {
      return
    }

    event.preventDefault()
    event.clipboardData.setData("text/plain", text)
  }

  return (
    <div className="relative col-start-1 row-start-1 min-h-0 min-w-0">
      <div className="flex h-full min-h-0 max-h-none flex-col gap-0 overflow-x-hidden overflow-y-auto p-0" ref={attachViewport} onScroll={handleScroll} aria-live="polite">
        <div className="box-border flex min-h-full flex-none flex-col pt-16 pb-[22px]" ref={attachContent}>
          <div className="mx-auto flex w-full max-w-[768px] flex-1 flex-col gap-3 px-10 max-[700px]:px-5" onCopy={handleCopy}>{children}</div>
          <div className="sticky bottom-[22px] z-[2] mt-3 flex-none">
            {showEndButton && <button className="absolute bottom-full left-1/2 mb-3 inline-flex h-[34px] w-auto -translate-x-1/2 items-center justify-center gap-1.5 rounded-full border border-outline-strong bg-surface-raised px-3 text-control font-medium text-secondary shadow-[0_8px_24px_rgb(0_0_0_/_28%)] hover:bg-surface-hover hover:text-primary active:scale-96 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface [&_svg]:size-4 [&_svg]:stroke-[1.75]" type="button" onClick={handleGoToEnd}><ArrowDownIcon aria-hidden="true" /><span>Ir para o fim</span></button>}
            {footer}
          </div>
        </div>
      </div>
    </div>
  )
}
