export function WorkspaceHint({ source, workingDirectoryOverride }: { source?: { name: string; directory: string | null }; workingDirectoryOverride: string }) {
  if (workingDirectoryOverride) {
    return <small className="text-support font-normal text-muted">O Bot usará esta pasta para trabalhar.</small>
  }

  if (source?.directory) {
    return <small className="text-support font-normal text-muted">Pasta de {source.name}: <span className="font-mono [overflow-wrap:anywhere]">{source.directory}</span></small>
  }

  return <small className="text-support font-normal text-muted">O Bot usará uma pasta privada do Jolt até você escolher outra.</small>
}
