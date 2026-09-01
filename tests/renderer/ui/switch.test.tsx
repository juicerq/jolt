import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { Switch } from "@src/renderer/src/ui/switch"

describe("Switch", () => {
  test.each([
    [true, 'role="switch" aria-checked="true"'],
    [false, 'role="switch" aria-checked="false"'],
  ])("reports checked=%p through the switch role", (checked, expected) => {
    expect(renderToStaticMarkup(<Switch checked={checked} onChange={() => {}} />)).toContain(expected)
  })

  test("a disabled Switch keeps its state and the disabled attribute", () => {
    const markup = renderToStaticMarkup(<Switch checked disabled onChange={() => {}} />)

    expect(markup).toContain("disabled")
    expect(markup).toContain('aria-checked="true"')
  })
})
