import { describe, expect, test } from "bun:test"
import { projectSchemas } from "@src/shared/projects"

describe("project boundary", () => {
  test("accepts a name and default working directory", () => {
    const input = { name: "Jots", defaultWorkingDirectory: "/projects/jots" }

    expect(projectSchemas.createInput.assert(input)).toEqual(input)
    expect(() => projectSchemas.createInput.assert({ name: "Jots" })).toThrow()
  })
})
