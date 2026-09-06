import { useState } from "react"
import type { MessageImage } from "@src/shared/conversations"
import { messageImageMimeTypes } from "@src/shared/message-images"
import { ImageDialog } from "../ui/dialog"

export const messageImageAccept = messageImageMimeTypes.join(",")

function isMessageImageFile(file: Pick<File, "type">): file is File & { type: MessageImage["mimeType"] } {
  return messageImageMimeTypes.some((mimeType) => mimeType === file.type)
}

function messageImageSource(image: MessageImage) {
  return `data:${image.mimeType};base64,${image.data}`
}

export async function readMessageImages(files: Iterable<File>): Promise<MessageImage[]> {
  const accepted = Array.from(files).filter(isMessageImageFile)

  return Promise.all(accepted.map(async (file) => ({ mimeType: file.type, data: await readBase64(file) })))
}

const chunkSize = 0x8000

async function readBase64(file: Blob) {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ""

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }

  return btoa(binary)
}

export function ChatImage({ image, index, className }: { image: MessageImage; index: number; className: string }) {
  const [open, setOpen] = useState(false)
  const src = messageImageSource(image)
  const alt = `Imagem ${index + 1}`

  return (
    <>
      <button className="block cursor-zoom-in rounded-lg border-0 bg-transparent p-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" type="button" aria-label={`Ampliar imagem ${index + 1}`} onClick={() => setOpen(true)}>
        <img className={className} src={src} alt={alt} />
      </button>
      {open && <ImageDialog src={src} alt={alt} onClose={() => setOpen(false)} />}
    </>
  )
}
