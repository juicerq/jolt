/** Use pi's own discovery, including user skills, project skills and configured packages. */
export async function loadPiSkills(cwd: string) {
  const { DefaultResourceLoader, getAgentDir } = await import("@earendil-works/pi-coding-agent")
  const loader = new DefaultResourceLoader({
    cwd,
    agentDir: getAgentDir(),
    noExtensions: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
  })

  await loader.reload()

  return loader.getSkills()
}
