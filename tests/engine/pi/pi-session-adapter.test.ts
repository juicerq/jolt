import { describe, expect, test } from "bun:test"
import { createEventNormalizer, toPiTool } from "@src/engine/pi/pi-session-adapter"

describe("pi session adapter", () => {
  test("a parameter named with a trailing ? is optional for the model", () => {
    const tool = toPiTool({
      name: "routine",
      description: "Create or change a Rotina",
      parameters: { "id?": "Id of the Rotina to change", content: "The message" },
      execute: async () => "",
    })

    expect(tool.parameters.required).toEqual(["content"])
    expect(Object.keys(tool.parameters.properties)).toEqual(["id", "content"])
  })

  test("a turn interrupted while a tool runs ends as aborted, not as an error", () => {
    const normalizer = createEventNormalizer()

    normalizer.normalize({ type: "agent_start" })
    normalizer.normalize({ type: "tool_execution_start", toolCallId: "bash-1", toolName: "bash", args: { command: "bun test" } })
    normalizer.abort()

    expect(normalizer.normalize({ type: "agent_settled" })).toEqual({ type: "finished", reason: "aborted" })
  })
})
