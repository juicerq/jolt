import { conversationPreview } from "./conversation-preview"
import type { Bot } from "@src/shared/bots"
import type { FinishReason } from "@src/shared/conversations"

const chimeTonesHz = [660, 880]
const toneSeconds = 0.14
const tonePeak = 0.1215
const bodyLimit = 120

let chime: AudioContext | undefined

export async function alertTurnFinished({ bot, reason, response, error }: { bot: Pick<Bot, "id" | "name"> | undefined; reason: FinishReason; response?: string; error?: string }) {
  if (!bot || reason === "aborted" || document.hasFocus()) {
    return
  }

  await window.desktop.notifyTurnFinished({ botId: bot.id, title: bot.name, body: notificationBody(reason, response, error) })
  await playChime()
}

function notificationBody(reason: FinishReason, response: string | undefined, error: string | undefined) {
  if (reason === "error") {
    if (!error) {
      return "Não foi possível concluir a resposta"
    }

    return `Não foi possível concluir a resposta: ${error}`
  }

  const text = response ? conversationPreview(response) : ""

  if (!text) {
    return "Resposta concluída"
  }

  if (text.length <= bodyLimit) {
    return text
  }

  return `${text.slice(0, bodyLimit).trimEnd().replace(/\s\S+$/, "")}…`
}

async function playChime() {
  const audio = (chime ??= new AudioContext())

  if (audio.state === "suspended") {
    await audio.resume()
  }

  for (const [index, hz] of chimeTonesHz.entries()) {
    const startedAt = audio.currentTime + index * toneSeconds
    const oscillator = audio.createOscillator()
    const gain = audio.createGain()

    oscillator.frequency.value = hz
    gain.gain.setValueAtTime(0, startedAt)
    gain.gain.linearRampToValueAtTime(tonePeak, startedAt + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, startedAt + toneSeconds)
    oscillator.connect(gain).connect(audio.destination)
    oscillator.start(startedAt)
    oscillator.stop(startedAt + toneSeconds)
  }
}
