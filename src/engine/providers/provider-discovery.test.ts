import { describe, expect, test } from "bun:test"
import type { Observability } from "../observability/observability"
import { createProviderDiscovery, type ProviderProbe } from "./provider-discovery"

function createObservability() {
  const spans: { name: string; provider?: string }[] = []
  const observability: Observability = {
    event() {},
    span(input, operation) {
      spans.push({ name: input.name, provider: input.context?.provider })

      return operation()
    },
    async flush() {},
  }

  return { observability, spans }
}

describe("provider discovery", () => {
  test("returns only provider, status and an optional version", async () => {
    const { observability } = createObservability()
    const probes: ProviderProbe[] = [
      { provider: "codex", probe: async () => ({ provider: "codex", status: "available", version: "0.151.0" }) },
      { provider: "claude", probe: async () => ({ provider: "claude", status: "unauthenticated", version: "2.1.250" }) },
    ]
    const discovery = createProviderDiscovery(observability, probes)

    const providers = await discovery.list()

    expect(providers).toEqual([
      { provider: "codex", status: "available", version: "0.151.0" },
      { provider: "claude", status: "unauthenticated", version: "2.1.250" },
    ])
    expect(discovery.current()).toEqual(providers)
  })

  test("isolates a broken provider and records each discovery span", async () => {
    const { observability, spans } = createObservability()
    const probes: ProviderProbe[] = [
      { provider: "codex", probe: async () => { throw new Error("token=secret user@example.com") } },
      { provider: "claude", probe: async () => ({ provider: "claude", status: "missing" }) },
    ]
    const discovery = createProviderDiscovery(observability, probes)

    const providers = await discovery.list()

    expect(providers).toEqual([
      { provider: "codex", status: "incompatible" },
      { provider: "claude", status: "missing" },
    ])
    expect(spans).toEqual([
      { name: "provider.discovery", provider: "codex" },
      { name: "provider.discovery", provider: "claude" },
    ])
  })
})
