import type { EngineClient } from "../engine-client"
import { listenEngineStream } from "../engine-stream"
import { setBrowserPages } from "./browser-store"

export function subscribeBrowserPages(client: Pick<EngineClient, "raw">) {
  return listenEngineStream({
    label: "o navegador",
    open: (signal) => client.raw.browser.pages(undefined, { signal }),
    handle: ({ pages }) => setBrowserPages(pages),
  })
}
