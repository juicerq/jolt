import { expect, setSystemTime, spyOn, test } from "bun:test"
import { join } from "node:path"
import { createPiModels } from "@src/engine/pi/pi-models"
import { createPiProvider } from "@src/engine/pi/pi-provider"
import { createObservationSystem } from "@src/engine/observability/observability"
import { testDirectory } from "../support/test-directory"

const directory = testDirectory("mimo-models-")

test("atualiza o catálogo sem bloquear leituras, compartilha a busca e preserva o cache quando a rede falha", async () => {
  const originalDirectory = process.env.PI_CODING_AGENT_DIR
  const originalOffline = process.env.PI_OFFLINE
  process.env.PI_CODING_AGENT_DIR = directory
  delete process.env.PI_OFFLINE
  setSystemTime(new Date("2030-01-01T00:00:00Z"))

  const started = Promise.withResolvers<void>()
  const response = Promise.withResolvers<Response>()
  const request = spyOn(globalThis, "fetch").mockImplementation(Object.assign(async () => {
    started.resolve()

    return response.promise
  }, { preconnect() {} }))
  const observations = createObservationSystem({ appSessionId: "models-test", logDirectory: join(directory, "logs"), development: false })
  const models = createPiModels()
  const providers = createPiProvider(observations.observability, models)
  let pending: Promise<void[]> | undefined

  try {
    await models.setKey("opencode", "test-key")

    const before = await models.available("opencode")
    const baseline = before.find((model) => model.id === "minimax-m3")
    expect(baseline).toBeDefined()
    pending = Promise.all([providers.refreshModels(), providers.refreshModels()])
    await started.promise
    expect(await models.available("opencode")).toEqual(before)
    response.resolve(Response.json([{ ...baseline, id: "new-model", name: "New model" }], {
      headers: { "last-modified": new Date().toUTCString(), etag: "catalog-1" },
    }))
    await pending

    expect(request).toHaveBeenCalledTimes(1)
    expect((await providers.models()).find((catalog) => catalog.provider === "opencode")?.models).toContainEqual({ id: "new-model", name: "New model" })
    expect((await models.resolve("opencode", "minimax-m3")).model.id).toBe("minimax-m3")
    await providers.refreshModels()
    expect(request).toHaveBeenCalledTimes(1)

    setSystemTime(new Date("2030-01-01T05:00:00Z"))
    request.mockResolvedValue(new Response("Forbidden", { status: 403 }))
    await providers.refreshModels()
    expect(request).toHaveBeenCalledTimes(2)
    expect((await models.resolve("opencode", "new-model")).model.id).toBe("new-model")
    await observations.observability.flush()
    expect(observations.diagnostics.recent().some((item) => item.name === "provider.catalogrefresh" && item.level === "error")).toBe(true)
  } finally {
    response.resolve(new Response(null, { status: 403 }))
    await pending
    request.mockRestore()
    setSystemTime()
    await observations.observability.flush()

    if (originalDirectory === undefined) {
      delete process.env.PI_CODING_AGENT_DIR
    } else {
      process.env.PI_CODING_AGENT_DIR = originalDirectory
    }

    if (originalOffline === undefined) {
      delete process.env.PI_OFFLINE
    } else {
      process.env.PI_OFFLINE = originalOffline
    }
  }
})
