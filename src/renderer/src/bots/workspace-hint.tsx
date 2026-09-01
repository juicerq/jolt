export function WorkspaceHint({ source, workingDirectoryOverride }: { source?: { name: string; directory: string }; workingDirectoryOverride: string }) {
  if (workingDirectoryOverride) {
    return <small className="text-support font-medium text-muted">Este Bot usará a pasta própria no lugar da pasta herdada.</small>
  }

  if (source) {
    return <small className="text-support font-medium text-muted">Herdada de {source.name}: <span className="font-mono [overflow-wrap:anywhere]">{source.directory}</span></small>
  }

  return <small className="text-support font-medium text-muted">O Jolt criará uma pasta privada para este Bot.</small>
}
