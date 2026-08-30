import { afterEach, beforeEach } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

export function testDirectory(prefix: string) {
  const path = mkdtempSync(join(tmpdir(), prefix))

  beforeEach(() => mkdirSync(path, { recursive: true }))
  afterEach(() => rmSync(path, { recursive: true, force: true }))

  return path
}
