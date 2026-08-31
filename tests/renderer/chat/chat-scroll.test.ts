import { describe, expect, test } from "bun:test"
import { getChatScrollMode } from "@src/renderer/src/chat/chat-scroll"

describe("chat scroll", () => {
  test.each([
    { distanceFromEnd: 0, expected: "follow" },
    { distanceFromEnd: 160, expected: "follow" },
    { distanceFromEnd: 161, expected: "preserve" },
  ] as const)("uses $expected mode at $distanceFromEnd pixels from the end", ({ distanceFromEnd, expected }) => {
    expect(getChatScrollMode(distanceFromEnd)).toBe(expected)
  })
})
