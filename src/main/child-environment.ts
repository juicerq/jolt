const inheritedNames = ["PATH", "HOME", "USER", "TMPDIR", "LANG", "SystemRoot", "ComSpec", "PATHEXT", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "ProgramData", "TEMP", "TMP"]

export function inheritedEnvironment() {
  return Object.fromEntries(inheritedNames.flatMap((name) => (process.env[name] ? [[name, process.env[name]]] : [])))
}
