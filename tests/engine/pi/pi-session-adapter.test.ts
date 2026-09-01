import { describe, expect, test } from "bun:test"
import { toPiTool } from "@src/engine/pi/pi-session-adapter"

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
})
