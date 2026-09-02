import { ArrowDownIcon } from "@heroicons/react/24/outline"
import { createContext, type PropsWithChildren, type UIEvent, useCallback, useContext, useRef, useState } from "react"
import { flushSync } from "react-dom"
import { getChatScrollMode } from "./chat-scroll"

type RevealAbove = (update: () => void) => void

const ChatScrollerContext = createContext<RevealAbove>((update) => update())

export function useRevealAbove() {
  return useContext(ChatScrollerContext)
}

export function ChatScroller({ children }: PropsWithChildren) {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const mutationObserverRef = useRef<MutationObserver | null>(null)
  const frameRef = useRef<number | null>(null)
  const shouldFollowRef = useRef(true)
  const [showEndButton, setShowEndButton] = useState(false)

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

        const distanceFromEnd = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight
        const contentIsNearEnd = getChatScrollMode(distanceFromEnd) === "follow"

        if (shouldFollowRef.current || contentIsNearEnd) {
          shouldFollowRef.current = true
          setShowEndButton(false)
          viewport.scrollTo({ top: viewport.scrollHeight })
          return
        }

        setShowEndButton(true)
      })
    }

    resizeObserverRef.current = new ResizeObserver(scheduleReconciliation)
    resizeObserverRef.current.observe(content)
    resizeObserverRef.current.observe(viewportRef.current)
    mutationObserverRef.current = new MutationObserver(scheduleReconciliation)
    mutationObserverRef.current.observe(content, { childList: true, characterData: true, subtree: true })
  }, [])

  const attachViewport = useCallback((viewport: HTMLDivElement | null) => {
    viewportRef.current = viewport
    connectObserver()
  }, [connectObserver])

  const attachContent = useCallback((content: HTMLDivElement | null) => {
    contentRef.current = content
    connectObserver()
  }, [connectObserver])

  const revealAbove = useCallback<RevealAbove>((update) => {
    const viewport = viewportRef.current

    if (!viewport) {
      update()
      return
    }

    const heightBefore = viewport.scrollHeight
    shouldFollowRef.current = false
    flushSync(update)
    viewport.scrollTop += viewport.scrollHeight - heightBefore
  }, [])

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    const viewport = event.currentTarget
    const distanceFromEnd = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight
    const shouldFollow = getChatScrollMode(distanceFromEnd) === "follow"

    shouldFollowRef.current = shouldFollow
    setShowEndButton(!shouldFollow)
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

  return (
    <ChatScrollerContext value={revealAbove}>
      <div className="relative col-start-1 row-start-1 min-h-0 min-w-0">
        <div className="flex h-full min-h-0 max-h-none flex-col gap-0 overflow-x-hidden overflow-y-auto p-0" ref={attachViewport} onScroll={handleScroll} aria-live="polite">
          <div className="box-border flex min-h-full flex-none flex-col gap-6 px-[clamp(28px,12vw,180px)] pt-16 pb-28 max-[700px]:px-5" ref={attachContent}>{children}</div>
        </div>
        {showEndButton && <button className="absolute bottom-[88px] left-1/2 z-[2] inline-flex h-[34px] w-auto -translate-x-1/2 items-center justify-center gap-1.5 rounded-full border border-outline-strong bg-surface-raised px-3 text-control font-medium text-secondary shadow-[0_8px_24px_rgb(0_0_0_/_28%)] hover:bg-surface-hover hover:text-primary active:scale-96 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface [&_svg]:size-4 [&_svg]:stroke-[1.75]" type="button" onClick={handleGoToEnd}><ArrowDownIcon aria-hidden="true" /><span>Ir para o fim</span></button>}
      </div>
    </ChatScrollerContext>
  )
}
