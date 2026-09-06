import type { AuthInteraction, AuthPrompt } from "@earendil-works/pi-ai"
import { z } from "zod"
import { parse } from "@src/shared/parse"
import { providerLoginInput, providerLoginReply, type ProviderLogin } from "@src/shared/providers"
import type { PiModels } from "./pi-models"

const authorizationUrl = z.url({ protocol: /^https$/, hostname: /^auth\.openai\.com$/ })
const loginTimeoutMs = 5 * 60_000

export function createPiAuthentication(models: Pick<PiModels, "login">) {
  let current: { state: ProviderLogin; controller: AbortController; done: Promise<void>; reply?: (value: string) => void } | undefined

  function session(id: string) {
    if (!current || current.state.id !== id) {
      throw new Error("Esta conexão expirou. Tente conectar novamente.")
    }

    return current
  }

  async function start() {
    if (current?.state.status === "pending") {
      return structuredClone(current.state)
    }

    const controller = new AbortController()
    const ready = Promise.withResolvers<void>()
    const attempt: NonNullable<typeof current> = {
      state: { id: crypto.randomUUID(), status: "pending", manual: false },
      controller,
      done: Promise.resolve(),
    }
    current = attempt
    const timeout = setTimeout(() => controller.abort("expired"), loginTimeoutMs)

    async function prompt(input: AuthPrompt) {
      controller.signal.throwIfAborted()

      if (input.type === "select" && input.options.some((option) => option.id === "browser")) {
        return "browser"
      }

      if (input.type !== "manual_code") {
        throw new Error("Etapa de autenticação não suportada")
      }

      const signal = AbortSignal.any([controller.signal, ...(input.signal ? [input.signal] : [])])
      signal.throwIfAborted()
      attempt.state.manual = true
      const answer = Promise.withResolvers<string>()
      const abort = () => answer.reject(signal.reason)
      signal.addEventListener("abort", abort, { once: true })
      attempt.reply = answer.resolve

      try {
        return await answer.promise
      } finally {
        signal.removeEventListener("abort", abort)
        delete attempt.reply
        attempt.state.manual = false
      }
    }

    const interaction: AuthInteraction = {
      signal: controller.signal,
      prompt,
      notify(event) {
        if (event.type === "auth_url") {
          attempt.state.url = parse(authorizationUrl, event.url)
          ready.resolve()
        }
      },
    }
    attempt.done = models.login(interaction).then(() => {
      attempt.state = { id: attempt.state.id, status: "connected", manual: false }
    }).catch(() => {
      const message = loginFailure(controller.signal)
      attempt.state = { id: attempt.state.id, status: "failed", manual: false, message }
    }).finally(() => {
      clearTimeout(timeout)
      ready.resolve()
    })
    await ready.promise

    return structuredClone(attempt.state)
  }

  return {
    start,
    status(rawInput: unknown) {
      return structuredClone(session(parse(providerLoginInput, rawInput).id).state)
    },
    reply(rawInput: unknown) {
      const input = parse(providerLoginReply, rawInput)
      const attempt = session(input.id)

      if (!attempt.reply || !attempt.state.url) {
        throw new Error("Esta etapa já terminou. Aguarde a confirmação da conexão.")
      }

      const callback = new URL(input.url)
      const authorization = new URL(attempt.state.url)

      if (callback.origin !== "http://localhost:1455" || callback.pathname !== "/auth/callback" || !callback.searchParams.get("code") || callback.searchParams.get("state") !== authorization.searchParams.get("state")) {
        throw new Error("Cole o endereço completo da página de retorno desta conexão.")
      }

      attempt.reply(input.url)
    },
    async cancel(rawInput: unknown) {
      const attempt = session(parse(providerLoginInput, rawInput).id)
      attempt.controller.abort()
      await attempt.done

      return structuredClone(attempt.state)
    },
  }
}

function loginFailure(signal: AbortSignal) {
  if (signal.reason === "expired") {
    return "O tempo para entrar acabou. Tente conectar novamente."
  }

  if (signal.aborted) {
    return "Conexão cancelada. Você pode tentar novamente quando quiser."
  }

  return "Não foi possível conectar ao ChatGPT. Confira sua conexão com a internet e tente novamente."
}
