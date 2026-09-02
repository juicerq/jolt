import type { PiRuntimeEvent, PiSession, PiSessionFactory } from "./pi-agent-runtime"

const chunkDelayMs = 15
const chunkLength = 24

const thinking = "Preciso ler o módulo de cobrança, comparar as três funções e escolher a que mantém a interface atual. Vou verificar os testes antes de responder."

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

function scriptedTurn(): PiRuntimeEvent[] {
  return [
    { type: "started" },
    { type: "thinking-started" },
    ...chunks(thinking).map((text): PiRuntimeEvent => ({ type: "thinking", text })),
    { type: "thinking-finished" },
    { type: "tool-started", callId: "read-1", tool: "read", detail: "src/billing/invoice.ts" },
    { type: "tool-finished", callId: "read-1", tool: "read", failed: false },
    { type: "tool-started", callId: "bash-1", tool: "bash", detail: "bun test tests/billing" },
    { type: "tool-finished", callId: "bash-1", tool: "bash", failed: false },
    ...chunks(response.repeat(4)).map((text): PiRuntimeEvent => ({ type: "text", text })),
    { type: "finished", reason: "stop" },
  ]
}

export function createPiLoadSessionFactory(): PiSessionFactory {
  return {
    async open(): Promise<PiSession> {
      const listeners = new Set<(event: PiRuntimeEvent) => void>()
      let aborted = false

      return {
        async prompt() {
          aborted = false

          for (const event of scriptedTurn()) {
            if (aborted) {
              return
            }

            await Bun.sleep(chunkDelayMs)

            for (const listener of listeners) {
              listener(event)
            }
          }
        },
        async abort() {
          aborted = true

          for (const listener of listeners) {
            listener({ type: "finished", reason: "aborted" })
          }
        },
        setTools() {},
        subscribe(listener) {
          listeners.add(listener)

          return () => listeners.delete(listener)
        },
        dispose() {},
      }
    },
  }
}
