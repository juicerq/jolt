import { reportTaskTool } from "@src/shared/tasks"
import { sendMessageTool } from "@src/shared/conversations"
import type { PiRuntimeEvent, PiSession, PiSessionFactory } from "./pi-agent-runtime"

const chunkDelayMs = 15
const chunkLength = 24

const thinking = "Preciso ler o módulo de cobrança, comparar as três funções e escolher a que mantém a interface atual. Vou verificar os testes antes de responder."

const response = [
  "Revisei o módulo de cobrança inteiro. O desconto é aplicado duas vezes quando há cupom e crédito na mesma compra, e o arredondamento acontece antes da soma dos itens.",
  "- `billing/invoice.ts`: aplica o desconto no subtotal e de novo em cada item.\n- `billing/tax.ts`: arredonda cada parcela antes de somar.\n- `billing/index.ts`: exporta uma função que ninguém chama.",
  [
    "```ts",
    "export function totalWithDiscount(items: Item[], discount: Discount) {",
    "  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0)",
    "",
    '  if (discount.kind === "percent") {',
    "    return subtotal * (1 - discount.value / 100)",
    "  }",
    "",
    "  return Math.max(0, subtotal - discount.value)",
    "}",
    "```",
  ].join("\n"),
  "| Arquivo | Linhas | Estado |\n| --- | --- | --- |\n| `billing/invoice.ts` | 212 | revisar |\n| `billing/tax.ts` | 88 | ok |\n| `billing/index.ts` | 14 | remover |",
  "Recomendo a segunda opção. Ela mantém a interface atual, não exige migração e o teste de carga mostrou o mesmo p95 da primeira com um terço do código.",
]

function chunks(text: string) {
  const parts: string[] = []

  for (let offset = 0; offset < text.length; offset += chunkLength) {
    parts.push(text.slice(offset, offset + chunkLength))
  }

  return parts
}

function scriptedTurn(): (PiRuntimeEvent | { type: "send"; content: string })[] {
  return [
    { type: "started" },
    { type: "thinking-started" },
    ...chunks(thinking).map((text): PiRuntimeEvent => ({ type: "thinking", text })),
    { type: "thinking-finished" },
    { type: "tool-started", callId: "read-1", tool: "read", detail: "src/billing/invoice.ts" },
    { type: "tool-finished", callId: "read-1", tool: "read", failed: false },
    { type: "tool-started", callId: "bash-1", tool: "bash", detail: "bun test tests/billing" },
    { type: "tool-finished", callId: "bash-1", tool: "bash", failed: false },
    ...Array.from({ length: 4 }, () => response).flat().flatMap((content) => [
      ...chunks(content).map((text): PiRuntimeEvent => ({ type: "text", text })),
      { type: "send" as const, content },
    ]),
    { type: "finished", reason: "stop" },
  ]
}

export function createPiLoadSessionFactory(): PiSessionFactory {
  return {
    async open(input): Promise<PiSession> {
      const send = input.customTools?.find((tool) => tool.name === sendMessageTool)

      if (!send) {
        throw new Error("Load provider requires send_message")
      }

      const listeners = new Set<(event: PiRuntimeEvent) => void>()
      let current: AbortController | undefined

      return {
        async compact() {
          return { tokensBefore: 12_000, estimatedTokensAfter: 4_000 }
        },
        async prompt() {
          const turn = new AbortController()
          current = turn

          for (const event of scriptedTurn()) {
            await Bun.sleep(chunkDelayMs)

            if (turn.signal.aborted) {
              return
            }

            if (event.type === "send") {
              await send.execute({ content: event.content }, turn.signal)

              continue
            }

            if (event.type === "finished" && event.reason === "stop") {
              const report = input.customTools?.find((tool) => tool.name === reportTaskTool)

              if (report) {
                await report.execute({ status: "done", content: response.join("\n\n") }, turn.signal)
              }
            }

            for (const listener of listeners) {
              listener(event)
            }
          }
        },
        async steer() {},
        async abort() {
          current?.abort()

          for (const listener of listeners) {
            listener({ type: "finished", reason: "aborted" })
          }
        },
        subscribe(listener) {
          listeners.add(listener)

          return () => listeners.delete(listener)
        },
        dispose() {
          current?.abort()
          listeners.clear()
        },
      }
    },
  }
}
