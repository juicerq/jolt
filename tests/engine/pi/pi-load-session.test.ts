import { expect, test } from "bun:test"
import { createPiLoadSessionFactory } from "@src/engine/pi/pi-load-session"
import type { PiRuntimeEvent } from "@src/engine/pi/pi-agent-runtime"

test("streams a scripted Markdown turn in small chunks and finishes", async () => {
  const session = await createPiLoadSessionFactory().open({ botId: "leve", cwd: "/tmp", tools: [], effort: "medium", model: null, policy: { botId: "leve", allowedRoot: "/tmp", mode: "full" } })
  const events: PiRuntimeEvent[] = []
  session.subscribe((event) => events.push(event))

  await session.prompt({ content: "Revise" })

  const text = events.filter((event) => event.type === "text")

  expect(events[0]).toEqual({ type: "started" })
  expect(events.at(-1)).toEqual({ type: "finished", reason: "stop" })
  expect(text.length).toBeGreaterThan(100)
  expect(text.map((event) => event.type === "text" ? event.text : "").join("")).toContain("```ts")
}, 30_000)
