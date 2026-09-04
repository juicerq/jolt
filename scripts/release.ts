import { $ } from "bun"

const version = Bun.argv.at(2)

if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  throw new Error("Usage: bun run release <major.minor.patch>")
}

const tag = `v${version}`
const branch = (await $`git rev-parse --abbrev-ref HEAD`.text()).trim()

if (branch !== "main") {
  throw new Error(`Releases go out from main, not ${branch}`)
}

const pending = (await $`git status --porcelain`.text()).trim()

if (pending) {
  throw new Error(`Commit or stash the working tree first:\n${pending}`)
}

const taken = (await $`git tag --list ${tag}`.text()).trim()

if (taken) {
  throw new Error(`Tag ${tag} already exists`)
}

const manifestPath = "package.json"
const manifest = await Bun.file(manifestPath).text()
const versionLine = manifest.match(/^ {2}"version": "([^"]+)",$/m)

if (!versionLine) {
  throw new Error("Cannot find the version line in package.json")
}

if (versionLine[1] === version) {
  throw new Error(`package.json is already at ${version}`)
}

await Bun.write(manifestPath, manifest.replace(versionLine[0], `  "version": "${version}",`))
await $`git add package.json`
await $`git commit -m ${`Release ${tag}`}`
await $`git tag ${tag}`
await $`git push origin main`
await $`git push origin ${tag}`

console.log(`${tag} is building at https://github.com/juicerq/jolt/actions`)
