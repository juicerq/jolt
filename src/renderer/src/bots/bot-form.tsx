import { FolderIcon, PencilIcon, XMarkIcon } from "@heroicons/react/24/outline"
import type { ReactNode } from "react"
import { fieldControlClassName } from "../ui/field"
import { IconButton } from "../ui/icon-button"

export const lineClassName = "border-0 bg-transparent text-center placeholder:text-muted focus-visible:outline-none"
export const editableLineClassName = `${lineClassName} field-sizing-content min-w-40 max-w-full pl-2 pr-7`

export function EditableLine({ children }: { children: ReactNode }) {
  return (
    <span className="group/line relative inline-flex max-w-full ml-5 rounded-md transition-colors duration-150 hover:bg-surface-hover focus-within:bg-surface-hover has-disabled:bg-transparent">
      {children}
      <PencilIcon className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-muted opacity-0 transition-opacity duration-150 group-hover/line:opacity-100 group-focus-within/line:opacity-100 group-has-disabled/line:opacity-0 motion-reduce:transition-none" aria-hidden="true" />
    </span>
  )
}
export const revealClassName = "transition-[opacity,transform] duration-180 ease-out starting:translate-y-1 starting:opacity-0 motion-reduce:transition-none"
export const hintClassName = `${revealClassName} text-metadata font-normal text-muted opacity-60`
export const settledClassName = `${revealClassName} cursor-text rounded-md border-0 bg-transparent px-2 py-0 hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring active:bg-surface-active`

const chipClassName = `${fieldControlClassName} flex cursor-pointer items-center gap-2 text-left hover:border-focus`

export function FolderChip({ value, onChoose, onClear }: { value: string; onChoose: () => void; onClear: () => void }) {
  if (!value) {
    return <button className={chipClassName} type="button" onClick={onChoose}><FolderIcon className="size-4 shrink-0 text-secondary" aria-hidden="true" /><span className="text-muted">Pasta</span></button>
  }

  return (
    <span className={`${chipClassName} cursor-default pr-1.5 hover:border-outline-strong`}>
      <FolderIcon className="size-4 shrink-0 text-secondary" aria-hidden="true" />
      <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap" title={value}>{value.split("/").filter(Boolean).at(-1)}</span>
      <IconButton iconSize={13} size={24} type="button" label="Remover pasta" onClick={onClear}><XMarkIcon aria-hidden="true" /></IconButton>
    </span>
  )
}
