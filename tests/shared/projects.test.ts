import { describe, expect, test } from "bun:test"
import { projectSchemas } from "@src/shared/projects"

describe("project boundary", () => {
  test("accepts a name and default working directory", () => {
    const input = { name: "Jolt", defaultWorkingDirectory: "/projects/jolt" }

    expect(projectSchemas.createInput.parse(input)).toEqual(input)
    expect(() => projectSchemas.createInput.parse({ name: "Jolt" })).toThrow()
  })
})
