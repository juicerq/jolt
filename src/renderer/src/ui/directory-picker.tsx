import { FolderIcon, XMarkIcon } from "@heroicons/react/24/outline"
import { useState } from "react"
import { IconButton } from "./icon-button"

const pickerClassName =
  "flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-lg border border-outline-strong bg-canvas px-3 py-[11px] text-left text-control font-medium text-secondary hover:border-focus hover:bg-surface-hover hover:text-primary focus-visible:border-focus focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring active:bg-surface-active"

export function useDirectoryChooser(onSelect: (directory: string) => void) {
  const [error, setError] = useState<string>()

  async function choose() {
    setError(undefined)
    const selected = await window.desktop.chooseWorkingDirectory().catch((selectionError: unknown) => {
      setError(selectionError instanceof Error ? selectionError.message : "Não foi possível abrir a pasta")
      return null
    })

    if (selected) {
      onSelect(selected)
    }
  }

  return { choose, error }
}

export function DirectoryPicker({ value, placeholder, onChoose, onClear }: { value: string; placeholder: string; onChoose: () => void; onClear?: () => void }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <button className={pickerClassName} type="button" onClick={onChoose}><FolderIcon className="size-[17px] shrink-0" aria-hidden="true" /><span className="min-w-0 truncate">{value || placeholder}</span></button>
      {value && onClear && <IconButton type="button" label="Remover pasta" size={34} iconSize={16} onClick={onClear}><XMarkIcon aria-hidden="true" /></IconButton>}
    </div>
  )
}
