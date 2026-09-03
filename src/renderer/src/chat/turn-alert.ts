import remarkGfm from "remark-gfm"
import remarkParse from "remark-parse"
import { unified } from "unified"
import { visit } from "unist-util-visit"
import type { Bot } from "../../../shared/bots"
import type { FinishReason } from "../../../shared/conversations"

const chimeTonesHz = [660, 880]
const toneSeconds = 0.14
const tonePeak = 0.1215
const bodyLimit = 120

let chime: AudioContext | undefined
let markdown: ReturnType<typeof buildMarkdownParser> | undefined

export async function alertTurnFinished({ bot, reason, response, error }: { bot: Pick<Bot, "id" | "name"> | undefined; reason: FinishReason; response?: string; error?: string }) {
  if (!bot || reason === "aborted" || document.hasFocus()) {
    return
  }

  await window.desktop.notifyTurnFinished({ botId: bot.id, title: bot.name, body: notificationBody(reason, response, error) })
  await playChime()
}

function notificationBody(reason: FinishReason, response: string | undefined, error: string | undefined) {
  if (reason === "error") {
    return error ? `O turno falhou: ${error}` : "O turno falhou"
  }

  const text = response ? plainText(response) : ""

  if (!text) {
    return "Terminou o turno"
  }

  if (text.length <= bodyLimit) {
    return text
  }

  return `${text.slice(0, bodyLimit).trimEnd().replace(/\s\S+$/, "")}…`
}

function buildMarkdownParser() {
  return unified().use(remarkParse).use(remarkGfm)
}

function plainText(response: string) {
  const parser = (markdown ??= buildMarkdownParser())
  const spoken: string[] = []

  visit(parser.parse(response), (node) => {
    if (node.type === "text" || node.type === "inlineCode") {
      spoken.push(node.value)
    }
  })

  return spoken.join(" ").replace(/\s+/g, " ").trim()
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
