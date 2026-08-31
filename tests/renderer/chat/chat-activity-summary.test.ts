import { describe, expect, test } from "bun:test"
import { formatChatActivitySummary } from "@src/renderer/src/chat/chat-activity-summary"

describe("formatChatActivitySummary", () => {
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

    expect(summary).toBe("Raciocinou por 5s, leu 3 arquivos e executou 5 comandos")
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
})
