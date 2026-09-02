import { describe, expect, test } from "bun:test"
import { formatChatActivityStepLabel, formatChatActivitySummary, formatRunningChatActivityStepLabel, getChatActivityStepDetails } from "@src/renderer/src/chat/chat-activity-summary"

describe("formatChatActivitySummary", () => {
  test("names a Plugin tool by its label instead of its name", () => {
    const step = { type: "tool" as const, name: "gmail_search", tools: [{ callId: "gmail-1", name: "gmail_search", label: "Pesquisa no Gmail", status: "done" as const }] }

    expect(formatChatActivitySummary({ steps: [step] })).toBe("Usou pesquisa no Gmail")
    expect(formatRunningChatActivityStepLabel({ ...step, tools: [{ ...step.tools[0]!, status: "running" }] })).toBe("Usando pesquisa no Gmail")
  })

  test("says the person denied a tool instead of calling it a failure", () => {
    const steps = [
      { type: "tool" as const, name: "bash", tools: [{ callId: "bash-1", name: "bash", detail: "rm -rf dist", status: "denied" as const, error: "The person denied this tool call" }] },
      { type: "tool" as const, name: "gmail_send", tools: [{ callId: "gmail-1", name: "gmail_send", label: "Envio de email pelo Gmail", status: "denied" as const }] },
    ]

    expect(formatChatActivitySummary({ steps })).toBe("Você negou 1 comando e negou envio de email pelo Gmail")
    expect(formatChatActivityStepLabel(steps[0]!)).toBe("Você negou 1 comando")
    expect(getChatActivityStepDetails(steps[0]!)).toEqual({ prose: false, items: ["rm -rf dist"] })
  })

  test("describes reasoning, files read and commands without a generic action count", () => {
    const summary = formatChatActivitySummary({
      steps: [
        { type: "thinking", content: "Planejando", durationMs: 2_000 },
        {
          type: "tool",
          name: "read",
          tools: [
            { callId: "read-1", name: "read", detail: "src/app.ts", status: "done" },
            { callId: "read-2", name: "read", detail: "src/store.ts", status: "done" },
            { callId: "read-3", name: "read", detail: "src/view.tsx", status: "done" },
          ],
        },
        { type: "thinking", content: "Validando", durationMs: 3_000 },
        {
          type: "tool",
          name: "bash",
          tools: [
            { callId: "bash-1", name: "bash", detail: "bun test", status: "done" },
            { callId: "bash-2", name: "bash", detail: "bun run typecheck", status: "done" },
            { callId: "bash-3", name: "bash", detail: "git diff --check", status: "done" },
            { callId: "bash-4", name: "bash", detail: "git status --short", status: "done" },
            { callId: "bash-5", name: "bash", detail: "bun run db:check", status: "done" },
          ],
        },
      ],
    })

    expect(summary).toBe("Pensou por 5s, leu 3 arquivos e executou 5 comandos")
  })

  test("does not present failed commands as successful commands", () => {
    const summary = formatChatActivitySummary({
      steps: [
        { type: "tool", name: "read", tools: [{ callId: "read-1", name: "read", detail: "README.md", status: "done" }] },
        { type: "tool", name: "bash", tools: [{ callId: "bash-1", name: "bash", detail: "bun test", status: "failed" }] },
      ],
    })

    expect(summary).toBe("Leu 1 arquivo e 1 comando falhou")
  })

  test("counts the same file once when it is read repeatedly", () => {
    const summary = formatChatActivitySummary({
      steps: [
        {
          type: "tool",
          name: "read",
          tools: [
            { callId: "read-1", name: "read", detail: "README.md", status: "done" },
            { callId: "read-2", name: "read", detail: "README.md", status: "done" },
          ],
        },
      ],
    })

    expect(summary).toBe("Leu 1 arquivo")
  })

  test("names the member who received a delegation instead of the tool", () => {
    const summary = formatChatActivitySummary({
      steps: [
        { type: "thinking", content: "Planejando", durationMs: 1_000 },
        { type: "tool", name: "delegate", tools: [{ callId: "delegate-1", name: "delegate", detail: "Iara", status: "done" }] },
        { type: "tool", name: "delegate", tools: [{ callId: "delegate-2", name: "delegate", detail: "Caio", status: "failed" }] },
        { type: "tool", name: "transfer", tools: [{ callId: "transfer-1", name: "transfer", detail: "Maya", status: "done" }] },
      ],
    })

    expect(summary).toBe("Pensou por 1s, delegou para Iara, delegação para Caio falhou e transferiu para Maya")
  })
})
