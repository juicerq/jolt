import { oc } from "@orpc/contract"
import { type } from "arktype"

export const engineReadyMessage = type({
  type: type.enumerated("ready"),
  port: "number.integer > 0",
})

export const loopbackHttpUrl = type("string").narrow((value) => {
  try {
    const url = new URL(value)

    return url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost")
  } catch {
    return false
  }
})

export const engineConnection = type({
  url: loopbackHttpUrl,
  token: "string > 0",
})

const healthOutput = type({
  status: type.enumerated("ready"),
  runtime: "string",
  startedAt: "string",
})

export const engineContract = {
  health: oc.output(healthOutput).route({ method: "GET", path: "/health" }),
}
