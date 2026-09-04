import type { PiRuntimeEvent, PiSession, PiSessionFactory } from "./pi-agent-runtime"

const chunkDelayMs = 15
const chunkLength = 24

const thinking = "Preciso ler o módulo de cobrança, comparar as três funções e escolher a que mantém a interface atual. Vou verificar os testes antes de responder."
const progress = "Encontrei dois pontos no cálculo. Vou comparar o impacto antes de fechar a recomendação."

const response = [
  "## Resultado da revisão",
  "",
  "Revisei o módulo de cobrança inteiro. O desconto é aplicado duas vezes quando há cupom e crédito na mesma compra, e o arredondamento acontece antes da soma dos itens.",
  "",
  "- `billing/invoice.ts`: aplica o desconto no subtotal e de novo em cada item.",
  "- `billing/tax.ts`: arredonda cada parcela antes de somar.",
  "- `billing/index.ts`: exporta uma função que ninguém chama.",
  "",
  "```ts",
  "export function totalWithDiscount(items: Item[], discount: Discount) {",
  "  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0)",
  "",
  "  if (discount.kind === \"percent\") {",
  "    return subtotal * (1 - discount.value / 100)",
  "  }",
  "",
  "  return Math.max(0, subtotal - discount.value)",
  "}",
  "```",
  "",
  "| Arquivo | Linhas | Estado |",
  "| --- | --- | --- |",
  "| `billing/invoice.ts` | 212 | revisar |",
  "| `billing/tax.ts` | 88 | ok |",
  "| `billing/index.ts` | 14 | remover |",
  "",
  "Recomendo a segunda opção. Ela mantém a interface atual, não exige migração e o teste de carga mostrou o mesmo p95 da primeira com um terço do código.",
  "",
].join("\n")

function chunks(text: string) {
  const parts: string[] = []

  for (let offset = 0; offset < text.length; offset += chunkLength) {
    parts.push(text.slice(offset, offset + chunkLength))
  }

  return parts
}

type ScriptedEvent = PiRuntimeEvent | { type: "send-message"; callId: string; content: string }

function scriptedTurn(): ScriptedEvent[] {
  return [
    { type: "started" },
    { type: "thinking-started" },
    ...chunks(thinking).map((text): PiRuntimeEvent => ({ type: "thinking", text })),
    { type: "thinking-finished" },
    { type: "send-message", callId: "send-1", content: progress },
    { type: "tool-started", callId: "read-1", tool: "read", detail: "src/billing/invoice.ts" },
    { type: "tool-finished", callId: "read-1", tool: "read", failed: false },
    { type: "tool-started", callId: "bash-1", tool: "bash", detail: "bun test tests/billing" },
    { type: "tool-finished", callId: "bash-1", tool: "bash", failed: false },
    { type: "send-message", callId: "send-2", content: response.repeat(4) },
    { type: "finished", reason: "stop" },
  ]
}

export function createPiLoadSessionFactory(): PiSessionFactory {
  return {
    async open(input): Promise<PiSession> {
      const listeners = new Set<(event: PiRuntimeEvent) => void>()
      const messageTool = input.customTools?.find((tool) => tool.name === "send_message")
      let aborted = false

      return {
        async compact() {
          return { tokensBefore: 12_000, estimatedTokensAfter: 4_000 }
        },
        async prompt() {
          aborted = false

          for (const event of scriptedTurn()) {
            if (aborted) {
              return
            }

            await Bun.sleep(chunkDelayMs)

            if (event.type === "send-message") {
              for (const listener of listeners) {
                listener({ type: "tool-started", callId: event.callId, tool: "send_message" })
              }

              await messageTool?.execute({ content: event.content })

              for (const listener of listeners) {
                listener({ type: "tool-finished", callId: event.callId, tool: "send_message", failed: false })
              }

              continue
            }

            for (const listener of listeners) {
              listener(event)
            }
          }
        },
        async steer() {},
        async abort() {
          aborted = true

          for (const listener of listeners) {
            listener({ type: "finished", reason: "aborted" })
          }
        },
        subscribe(listener) {
          listeners.add(listener)

          return () => listeners.delete(listener)
        },
        dispose() {},
      }
    },
  }
}
