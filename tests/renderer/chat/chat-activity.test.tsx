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
    expect(markup).toContain("<strong>Planejando</strong>")
    expect(markup).toContain("Ler o arquivo")
  })

  test("opens a single thought to show what was thought", () => {
    const markup = renderToStaticMarkup(
      <ChatActivity activity={{ steps: [{ type: "thinking", content: "Escolhendo a validação", durationMs: 2_000 }] }} />,
    )

    expect(markup.match(/<summary/g)).toHaveLength(1)
    expect(markup.match(/Pensou por 2s/g)).toHaveLength(1)
    expect(markup).toContain("Escolhendo a validação")
  })

  test("shows a single step as a flat line when opening it adds nothing", () => {
    const markup = renderToStaticMarkup(
      <ChatActivity activity={{ steps: [{ type: "thinking", content: "", durationMs: 1_000 }] }} />,
    )

    expect(markup).not.toContain("<summary")
    expect(markup.match(/Pensou por 1s/g)).toHaveLength(1)
  })

  test("keeps a single step expandable when its detail is only visible open", () => {
    const markup = renderToStaticMarkup(
      <ChatActivity activity={{ steps: [{ type: "tool", name: "read", tools: [{ callId: "read-1", name: "read", detail: "README.md", status: "done" }] }] }} />,
    )

    expect(markup.match(/<summary/g)).toHaveLength(1)
    expect(markup.match(/Leu 1 arquivo/g)).toHaveLength(1)
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

  test("lists the files of a lone read step straight under the summary", () => {
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

    expect(markup.match(/<details/g)).toHaveLength(1)
    expect(markup.match(/Leu 2 arquivos/g)).toHaveLength(1)
    expect(markup).toMatch(/<li[^>]*><code[^>]*>src\/app\.ts<\/code><\/li>/)
    expect(markup).toMatch(/<li[^>]*><code[^>]*>src\/store\.ts<\/code><\/li>/)
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

  test("shows a hire as waiting for the new member live and as hired in history", () => {
    const live = renderToStaticMarkup(
      <ChatActivity
        activity={{ steps: [{ type: "tool", name: "hire", tools: [{ callId: "hire-1", name: "hire", detail: "Clima SP", brief: "Resumo do clima hoje em SP", status: "running" }] }] }}
        botName="Marina"
        status="running"
      />,
    )
    const history = renderToStaticMarkup(
      <ChatActivity activity={{
        steps: [
          { type: "thinking", content: "", durationMs: 4_000 },
          { type: "tool", name: "hire", tools: [{ callId: "hire-1", name: "hire", detail: "Clima SP", brief: "Resumo do clima hoje em SP", status: "done" }] },
        ],
      }} />,
    )
    const failed = renderToStaticMarkup(
      <ChatActivity activity={{ steps: [{ type: "tool", name: "hire", tools: [{ callId: "hire-1", name: "hire", detail: "Clima SP", status: "failed" }] }] }} />,
    )

    expect(live).toContain("Aguardando Clima SP")
    expect(live).toContain("Resumo do clima hoje em SP")
    expect(live).not.toContain("<code")
    expect(live).toContain('aria-label="Atividade de contratação em andamento"')
    expect(live).not.toContain("Usando hire")
    expect(history).toContain("Pensou por 4s e contratou Clima SP")
    expect(history).toContain("Contratou Clima SP")
    expect(history).toContain("Resumo do clima hoje em SP")
    expect(history).not.toContain("<code")
    expect(failed).toContain("Contratação de Clima SP falhou")
  })

  test("shows why a Rotina tool failed", () => {
    const failed = renderToStaticMarkup(
      <ChatActivity activity={{ steps: [
        { type: "thinking", content: "", durationMs: 3_000 },
        { type: "tool", name: "routine", tools: [{ callId: "routine-1", name: "routine", brief: "Lembre o usuário de tomar café", status: "failed", error: "Validation failed for tool \"routine\":\n  - id: must have required properties id" }] },
      ] }} />,
    )

    expect(failed).toContain("Pensou por 3s e não conseguiu ajustar a Rotina")
    expect(failed).toContain("Não conseguiu ajustar a Rotina")
    expect(failed).toContain("Lembre o usuário de tomar café")
    expect(failed).toContain("must have required properties id")
    expect(failed).toContain('aria-label="Atividade de Rotina com falha"')
    expect(failed).not.toContain("<code")
  })

  test("splits consecutive delegations into one row per member", () => {
    const markup = renderToStaticMarkup(
      <ChatActivity activity={{
        steps: [{
          type: "tool",
          name: "delegate",
          tools: [
            { callId: "delegate-1", name: "delegate", detail: "Calo", brief: "Escrever os testes do módulo", status: "done" },
            { callId: "delegate-2", name: "delegate", detail: "Lia", brief: "Revisar a migração", status: "failed" },
          ],
        }],
      }} />,
    )

    const calo = markup.indexOf("Delegou para Calo", markup.indexOf("</summary>"))
    const caloBrief = markup.indexOf("Escrever os testes do módulo", calo)
    const lia = markup.indexOf("Delegação para Lia falhou", caloBrief)
    const liaBrief = markup.indexOf("Revisar a migração", lia)

    expect(markup).toContain("Delegou para Calo e delegação para Lia falhou")
    expect(calo).toBeGreaterThan(-1)
    expect(caloBrief).toBeGreaterThan(calo)
    expect(lia).toBeGreaterThan(caloBrief)
    expect(liaBrief).toBeGreaterThan(lia)
    expect(markup).toContain('aria-label="Atividade de delegação concluída"')
    expect(markup).toContain('aria-label="Atividade de delegação com falha"')
    expect(markup.match(/<summary/g)).toHaveLength(1)
  })

  test("shows what each delegation asked for under the member in history", () => {
    const markup = renderToStaticMarkup(
      <ChatActivity activity={{
        steps: [
          { type: "tool", name: "delegate", tools: [{ callId: "delegate-1", name: "delegate", detail: "Calo", brief: "Escrever os testes do módulo", status: "failed" }] },
          { type: "tool", name: "delegate", tools: [{ callId: "delegate-2", name: "delegate", detail: "Lia", brief: "Revisar a migração", status: "failed" }] },
        ],
      }} />,
    )

    expect(markup).toContain("Delegações para Calo e Lia falharam")
    expect(markup).toContain("Delegação para Calo falhou")
    expect(markup).toContain("Escrever os testes do módulo")
    expect(markup).toContain("Revisar a migração")
    expect(markup).not.toContain("<code")
  })
})
