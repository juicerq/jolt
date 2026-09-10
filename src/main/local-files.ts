import { constants } from "node:fs"
import { access, stat } from "node:fs/promises"
import { homedir } from "node:os"
import { isAbsolute, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { clipboard, ClipboardItem, shell } from "electron"
import { localFileLocation, localFileRequest, type LocalFileLocation } from "../shared/local-files"
import { parse } from "../shared/parse"

function absoluteFilePath(request: LocalFileLocation) {
  const expanded = request.path.startsWith("~/") ? resolve(homedir(), request.path.slice(2)) : request.path

  const directory = request.directory ?? ""

  if (!isAbsolute(expanded) && !isAbsolute(directory)) {
    return null
  }

  if (isAbsolute(expanded)) {
    return resolve(expanded)
  }

  return resolve(directory, expanded)
}

async function requireReadableFile(path: string) {
  const file = await stat(path).catch(() => { throw new Error("Arquivo não encontrado ou sem acesso. Confira a localização.") })

  if (!file.isFile()) {
    throw new Error("Esta localização não é um arquivo.")
  }

  await access(path, constants.R_OK).catch(() => { throw new Error("Arquivo não encontrado ou sem acesso. Confira a localização.") })
}

export async function resolveLocalFile(raw: unknown) {
  const request = parse(localFileLocation, raw)
  const path = absoluteFilePath(request)

  if (!path) {
    return null
  }

  return await requireReadableFile(path).then(() => path).catch(() => null)
}

export async function actOnLocalFile(raw: unknown) {
  const request = parse(localFileRequest, raw)
  const path = absoluteFilePath(request)

  if (!path) {
    throw new Error("Este arquivo precisa de uma pasta de trabalho para ser localizado.")
  }

  if (request.action === "copy-path") {
    await clipboard.writeText(path)

    return
  }

  await requireReadableFile(path)

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
