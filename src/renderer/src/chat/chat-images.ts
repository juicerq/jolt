import type { MessageImage } from "@src/shared/conversations"
import { messageImageMimeTypes } from "@src/shared/message-images"

export const messageImageAccept = messageImageMimeTypes.join(",")

function isMessageImageFile(file: Pick<File, "type">): file is File & { type: MessageImage["mimeType"] } {
  return messageImageMimeTypes.some((mimeType) => mimeType === file.type)
}

export function messageImageSource(image: MessageImage) {
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
