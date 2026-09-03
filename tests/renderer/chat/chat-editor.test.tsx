import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { ChatEditor } from "@src/renderer/src/chat/chat-editor"

const mentions = [{ botId: "emailer", name: "Emailer", avatarSeed: "jolt:new:Emailer" }]

function markup(content: string) {
  return renderToStaticMarkup(
    <ChatEditor
      id="prompt"
      content={content}
      mentions={mentions}
      placeholder="Converse com Atlas..."
      label="Mensagem para Atlas"
      disabled={false}
      menuOpen={false}
      menuId="menu"
      onChange={() => {}}
      onKeyDown={() => {}}
      onPasteFiles={() => {}}
    />,
  )
}

describe("ChatEditor", () => {
  test("turns a mention into an atomic chip the caret cannot enter", () => {
    const html = markup("use o @Emailer para o Pedro")

    expect(html).toContain('data-mention="@Emailer"')
    expect(html).toContain('contentEditable="false"')
    expect(html).toContain("use o ")
    expect(html).toContain(" para o Pedro")
  })

  test("leaves a name that belongs to no Bot as plain text", () => {
    expect(markup("@Ninguem")).not.toContain("data-mention")
  })

  test("marks the empty editor so the placeholder shows", () => {
    expect(markup("")).toContain('data-empty="true"')
    expect(markup("oi")).toContain('data-empty="false"')
  })
})
