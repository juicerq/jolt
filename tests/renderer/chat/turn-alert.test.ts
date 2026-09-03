import { beforeEach, describe, expect, test } from "bun:test"
import { alertTurnFinished } from "@src/renderer/src/chat/turn-alert"
import type { TurnNotification } from "@src/shared/turn-notification"

const notified: TurnNotification[] = []
const tones: number[] = []
let focused = false

Object.defineProperty(globalThis, "document", { configurable: true, value: { hasFocus: () => focused } })
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: {
    desktop: {
      async notifyTurnFinished(notification: TurnNotification) {
        notified.push(notification)
      },
    },
  },
})

class StubAudioContext {
  currentTime = 0
  state = "running"
  destination = {}
  async resume() {}
  createOscillator() {
    const oscillator = {
      frequency: { value: 0 },
      connect: (target: unknown) => target,
      start: () => tones.push(oscillator.frequency.value),
      stop: () => {},
    }

    return oscillator
  }
  createGain() {
    return {
      gain: { setValueAtTime: () => {}, linearRampToValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
      connect: (target: unknown) => target,
    }
  }
}

Object.defineProperty(globalThis, "AudioContext", { configurable: true, value: StubAudioContext })

describe("aviso de turno terminado", () => {
  beforeEach(() => {
    notified.length = 0
    tones.length = 0
    focused = false
  })

  test("toca o som e avisa com o nome do Bot e o começo da resposta", async () => {
    await alertTurnFinished({ bot: { name: "Marina" }, reason: "stop", response: "  Resposta\npronta  " })

    expect(notified).toEqual([{ title: "Marina", body: "Resposta pronta" }])
    expect(tones).toEqual([660, 880])
  })

  test("avisa com texto puro, sem a marcação do Markdown", async () => {
    await alertTurnFinished({ bot: { name: "Marina" }, reason: "stop", response: "## Resultado\n\n- Revisei o **módulo** de `cobranca`" })

    expect(notified).toEqual([{ title: "Marina", body: "Resultado Revisei o módulo de cobranca" }])
  })

  test("remove a marcação GFM que a conversa renderiza", async () => {
    await alertTurnFinished({ bot: { name: "Marina" }, reason: "stop", response: "~~Rascunho~~ Resultado final" })

    expect(notified).toEqual([{ title: "Marina", body: "Rascunho Resultado final" }])
  })

  test("não avisa quando a pessoa está na janela", async () => {
    focused = true

    await alertTurnFinished({ bot: { name: "Marina" }, reason: "stop", response: "Resposta pronta" })

    expect(notified).toEqual([])
    expect(tones).toEqual([])
  })

  test("não avisa um turno que a pessoa interrompeu", async () => {
    await alertTurnFinished({ bot: { name: "Marina" }, reason: "aborted", response: "Resposta parcial" })

    expect(notified).toEqual([])
    expect(tones).toEqual([])
  })

  test("não avisa um Bot que saiu do Time", async () => {
    await alertTurnFinished({ bot: undefined, reason: "stop", response: "Resposta pronta" })

    expect(notified).toEqual([])
    expect(tones).toEqual([])
  })

  test("avisa a falha do turno no lugar da resposta", async () => {
    await alertTurnFinished({ bot: { name: "Marina" }, reason: "error", response: "Resposta parcial" })

    expect(notified).toEqual([{ title: "Marina", body: "O turno falhou" }])
  })
})
