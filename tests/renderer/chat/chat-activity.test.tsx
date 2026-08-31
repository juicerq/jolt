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
    expect(markup).toContain("Raciocinou por 3s, leu 1 arquivo e executou 1 comando")
    expect(markup).toContain("Raciocinou por 3s")
    expect(markup).toContain("Leu 1 arquivo")
    expect(markup).toContain("Executou 1 comando")
    expect(markup).not.toContain("**Planejando**")
  })

  test.each([
    [450, "menos de 1s"],
    [72_000, "1min 12s"],
  ])("formats a %i millisecond reasoning duration as %s", (thinkingDurationMs, label) => {
    const markup = renderToStaticMarkup(
      <ChatActivity activity={{ steps: [{ type: "thinking", content: "Analisando", durationMs: thinkingDurationMs }] }} />,
    )

    expect(markup).toContain(`Raciocinou por ${label}`)
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

    const firstThinking = markup.indexOf("Raciocinou por 5s", markup.indexOf("chat-activity-content"))
    const fileRead = markup.indexOf("Leu 1 arquivo", firstThinking)
    const secondThinking = markup.indexOf("Raciocinou por 8s", fileRead)

    expect(markup).toContain("Raciocinou por 13s e leu 1 arquivo")
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

    expect(markup).toContain('<details class="chat-activity-stage-disclosure" open="">')
    expect(markup).toContain('<li><code>src/app.ts</code></li>')
    expect(markup).toContain('<li><code>src/store.ts</code></li>')
    expect(markup).toContain('class="chat-activity-stage-chevron"')
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
    expect(markup).not.toContain("chat-activity-details")
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

    expect(markup).toContain("Raciocinou por 5s")
    expect(markup).toContain("Leu 3 arquivos")
    expect(markup).toContain('<details class="chat-activity-stage-disclosure">')
    expect(markup).toContain('<li><code>README.md</code></li>')
    expect(markup).toContain('<li><code>PROJECT.md</code></li>')
    expect(markup).toContain('<li><code>CONTEXT.md</code></li>')
    expect(markup).not.toContain("README.md, PROJECT.md e CONTEXT.md")
    expect(markup).toContain("Raciocinou por 8s")
    expect(markup).toContain("Executando comando")
    expect(markup).toContain("bun test")
    expect(markup).toContain('aria-label="Atividade de raciocínio concluída"')
    expect(markup).toContain('aria-label="Atividade de leitura concluída"')
    expect(markup).toContain('aria-label="Atividade de comando em andamento"')
    expect(markup.match(/aria-current="step"/g)).toHaveLength(1)
    expect(markup).not.toContain("Analisando o projeto")
    expect(markup).not.toContain("Escolhendo a validação")
    expect(markup).not.toContain("Nina está trabalhando · 2 ações")
    expect(markup).not.toContain("chat-activity-details")
  })
})
