import { stat } from "node:fs/promises"
import { homedir } from "node:os"
import { isAbsolute, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { clipboard, ClipboardItem, shell } from "electron"
import { localFileRequest } from "../shared/local-files"
import { parse } from "../shared/parse"

export async function actOnLocalFile(raw: unknown) {
  const request = parse(localFileRequest, raw)
  const expanded = request.path.startsWith("~/") ? resolve(homedir(), request.path.slice(2)) : request.path

  const directory = request.directory ?? ""

  if (!isAbsolute(expanded) && !isAbsolute(directory)) {
    throw new Error("Este arquivo precisa de uma pasta de trabalho para ser localizado.")
  }

  const path = isAbsolute(expanded) ? resolve(expanded) : resolve(directory, expanded)

  if (request.action === "copy-path") {
    await clipboard.writeText(path)

    return
  }

  const file = await stat(path).catch(() => { throw new Error("Arquivo não encontrado ou sem acesso. Confira a localização.") })

  if (!file.isFile()) {
    throw new Error("Esta localização não é um arquivo.")
  }

  if (request.action === "reveal") {
    shell.showItemInFolder(path)

    return
  }

  if (request.action === "copy") {
    await clipboard.write([new ClipboardItem({ "text/uri-list": pathToFileURL(path).href })])

    return
  }

  const error = await shell.openPath(path)

  if (error) {
    throw new Error("Não foi possível abrir o arquivo no aplicativo padrão.")
  }
}
