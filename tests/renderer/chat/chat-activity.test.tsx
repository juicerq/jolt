import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { ChatActivity } from "@src/renderer/src/chat/chat-activity"

describe("ChatActivity", () => {
  test("groups reasoning and actions under one summary", () => {
    const markup = renderToStaticMarkup(
      <ChatActivity activity={{
        steps: [
          { type: "thinking", content: "**Planejando**\n\n- Ler o arquivo", durationMs: 3_200 },
          { type: "tool", name: "read", tools: [{ callId: "read-1", name: "read", detail: "README.md", status: "done" }] },
          { type: "tool", name: "bash", tools: [{ callId: "bash-1", name: "bash", detail: "bun test", status: "done" }] },
        ],
      }} />,
    )

    expect(markup.match(/<summary/g)).toHaveLength(1)
    expect(markup).toContain("Pensou por 3s, leu 1 arquivo e executou 1 comando")
    expect(markup).toContain("Pensou por 3s")
    expect(markup).toContain("Leu 1 arquivo")
    expect(markup).toContain("Executou 1 comando")
    expect(markup).not.toContain("**Planejando**")
  })

  test("shows a single step as a flat line when opening it adds nothing", () => {
    const markup = renderToStaticMarkup(
      <ChatActivity activity={{ steps: [{ type: "thinking", content: "Analisando", durationMs: 1_000 }] }} />,
    )

    expect(markup).not.toContain("<summary")
    expect(markup.match(/Pensou por 1s/g)).toHaveLength(1)
  })

  test("keeps a single step expandable when its detail is only visible open", () => {
    const markup = renderToStaticMarkup(
      <ChatActivity activity={{ steps: [{ type: "tool", name: "read", tools: [{ callId: "read-1", name: "read", detail: "README.md", status: "done" }] }] }} />,
    )

    expect(markup.match(/<summary/g)).toHaveLength(1)
    expect(markup).toContain("README.md")
  })

  test.each([
    [450, "menos de 1s"],
    [72_000, "1min 12s"],
  ])("formats a %i millisecond reasoning duration as %s", (thinkingDurationMs, label) => {
    const markup = renderToStaticMarkup(
      <ChatActivity activity={{ steps: [{ type: "thinking", content: "Analisando", durationMs: thinkingDurationMs }] }} />,
    )

    expect(markup).toContain(`Pensou por ${label}`)
  })

  test("restores the chronological steps when the completed summary opens", () => {
    const markup = renderToStaticMarkup(
      <ChatActivity activity={{
        steps: [
          { type: "thinking", content: "Primeira análise", durationMs: 5_000 },
          { type: "tool", name: "read", tools: [{ callId: "read-1", name: "read", detail: "README.md", status: "done" }] },
          { type: "thinking", content: "Segunda análise", durationMs: 8_000 },
        ],
      }} />,
    )

    const firstThinking = markup.indexOf("Pensou por 5s", markup.indexOf("</summary>"))
    const fileRead = markup.indexOf("Leu 1 arquivo", firstThinking)
    const secondThinking = markup.indexOf("Pensou por 8s", fileRead)

    expect(markup).toContain("Pensou por 13s e leu 1 arquivo")
    expect(firstThinking).toBeGreaterThan(-1)
    expect(fileRead).toBeGreaterThan(firstThinking)
    expect(secondThinking).toBeGreaterThan(fileRead)
  })

  test("renders multi-item action details as an open collapsible list in history", () => {
    const markup = renderToStaticMarkup(
      <ChatActivity activity={{
        steps: [{
          type: "tool",
          name: "read",
          tools: [
            { callId: "read-1", name: "read", detail: "src/app.ts", status: "done" },
            { callId: "read-2", name: "read", detail: "src/store.ts", status: "done" },
          ],
        }],
      }} />,
    )

    expect(markup.match(/<details/g)).toHaveLength(2)
    expect(markup).toMatch(/<details[^>]* open="">[\s\S]*<summary[^>]*>/)
    expect(markup).toMatch(/<li[^>]*><code[^>]*>src\/app\.ts<\/code><\/li>/)
    expect(markup).toMatch(/<li[^>]*><code[^>]*>src\/store\.ts<\/code><\/li>/)
    expect(markup).toContain("</summary><ul")
  })

  test("renders a pending run without a second thinking label", () => {
    const markup = renderToStaticMarkup(
      <ChatActivity
        activity={{ steps: [] }}
        botName="Nina"
        status="running"
        waitingMessage="Contatando Nina…"
      />,
    )

    expect(markup).toContain("Contatando Nina…")
    expect(markup).toContain("role=\"status\"")
    expect(markup).not.toContain("<details")
    expect(markup).not.toContain("<summary")
    expect(markup).not.toContain(">Pensando<")
  })

  test("keeps earlier live activities compact and the latest activity open", () => {
    const markup = renderToStaticMarkup(
      <ChatActivity
        activity={{
          steps: [
            { type: "thinking", content: "Analisando o projeto", durationMs: 5_000, status: "done" },
            {
              type: "tool",
              name: "read",
              tools: [
                { callId: "read-1", name: "read", detail: "README.md", status: "done" },
                { callId: "read-2", name: "read", detail: "PROJECT.md", status: "done" },
                { callId: "read-3", name: "read", detail: "CONTEXT.md", status: "done" },
              ],
            },
            { type: "thinking", content: "Escolhendo a validação", durationMs: 8_000, status: "done" },
            {
              type: "tool",
              name: "bash",
              tools: [{ callId: "bash-1", name: "bash", detail: "bun test", status: "running" }],
            },
          ],
        }}
        botName="Nina"
        status="running"
      />,
    )

    expect(markup).toContain("Pensou por 5s")
    expect(markup).toContain("Leu 3 arquivos")
    expect(markup).toMatch(/<details[^>]*>[\s\S]*<summary[^>]*>/)
    expect(markup).toMatch(/<li[^>]*><code[^>]*>README\.md<\/code><\/li>/)
    expect(markup).toMatch(/<li[^>]*><code[^>]*>PROJECT\.md<\/code><\/li>/)
    expect(markup).toMatch(/<li[^>]*><code[^>]*>CONTEXT\.md<\/code><\/li>/)
    expect(markup).not.toContain("README.md, PROJECT.md e CONTEXT.md")
    expect(markup).toContain("Pensou por 8s")
    expect(markup).toContain("Executando comando")
    expect(markup).toContain("bun test")
    expect(markup).toContain('aria-label="Atividade de pensamento concluída"')
    expect(markup).toContain('aria-label="Atividade de leitura concluída"')
    expect(markup).toContain('aria-label="Atividade de comando em andamento"')
    expect(markup.match(/aria-current="step"/g)).toHaveLength(1)
    expect(markup).not.toContain("Analisando o projeto")
    expect(markup).not.toContain("Escolhendo a validação")
    expect(markup).not.toContain("Nina está trabalhando · 2 ações")
  })

  test("shows a live delegation as waiting for the member and a finished one as delegated", () => {
    const live = renderToStaticMarkup(
      <ChatActivity
        activity={{ steps: [{ type: "tool", name: "delegate", tools: [{ callId: "delegate-1", name: "delegate", detail: "Iara", status: "running" }] }] }}
        botName="Dora"
        status="running"
      />,
    )
    const history = renderToStaticMarkup(
      <ChatActivity activity={{ steps: [{ type: "tool", name: "delegate", tools: [{ callId: "delegate-1", name: "delegate", detail: "Iara", status: "done" }] }] }} />,
    )

    expect(live).toContain("Aguardando Iara")
    expect(live).toContain('aria-label="Atividade de delegação em andamento"')
    expect(live).not.toContain("Usando delegate")
    expect(history).toContain("Delegou para Iara")
    expect(history).not.toContain("<summary")
  })
})
