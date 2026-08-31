import { ArrowDownIcon } from "@heroicons/react/24/outline"
import { type PropsWithChildren, type UIEvent, useCallback, useRef, useState } from "react"
import { getChatScrollMode } from "./chat-scroll"

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
    <div className="chat-scroller">
      <div className="message-list" ref={attachViewport} onScroll={handleScroll} aria-live="polite">
        <div className="chat-scroll-content" ref={attachContent}>{children}</div>
      </div>
      {showEndButton && <button className="chat-scroll-end-button" type="button" onClick={handleGoToEnd}><ArrowDownIcon aria-hidden="true" /><span>Ir para o fim</span></button>}
    </div>
  )
}
