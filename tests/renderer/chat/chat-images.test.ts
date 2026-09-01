import { expect, test } from "bun:test"
import { messageImageAccept, messageImageSource, readMessageImages } from "@src/renderer/src/chat/chat-images"

test("reads only image files into base64 Message images", async () => {
  const png = new File([new Uint8Array([137, 80, 78, 71])], "tela.png", { type: "image/png" })
  const text = new File(["hello"], "notas.txt", { type: "text/plain" })

  const images = await readMessageImages([text, png])

  expect(images).toEqual([{ mimeType: "image/png", data: "iVBORw==" }])
  expect(messageImageSource(images[0]!)).toBe("data:image/png;base64,iVBORw==")
})

test("the file picker accepts the same image types the Message schema accepts", () => {
  expect(messageImageAccept).toBe("image/png,image/jpeg,image/gif,image/webp")
})
