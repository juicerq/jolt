import { afterEach, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { BotFace } from "@src/renderer/src/bots/bot-face"
import { chatStore } from "@src/renderer/src/chat/chat-store"

const initialState = chatStore.state

afterEach(() => chatStore.setState(() => initialState))

test("shows a saved request before the session is loaded", () => {
  const html = renderToStaticMarkup(<BotFace name="Mimo" botId="saved-bot" status="awaiting-response" size={38} className="size-[38px]" />)

  expect(html).toContain('data-status="awaiting-response"')
  expect(html).toContain('aria-label="Aguardando resposta"')
})

test("live work and completion replace the saved pending request", () => {
  const face = <BotFace name="Mimo" botId="live-bot" status="awaiting-response" size={38} className="size-[38px]" />

  chatStore.setState((state) => ({ ...state, statuses: { "live-bot": "working" } }))
  expect(renderToStaticMarkup(face)).toContain('data-status="working"')

  chatStore.setState((state) => ({ ...state, statuses: { "live-bot": "completed" } }))
  expect(renderToStaticMarkup(face)).toContain('data-status="completed"')
})

test("a new identity remains available", () => {
  expect(renderToStaticMarkup(<BotFace name="New" size={64} className="size-16" />)).toContain('data-status="available"')
})
