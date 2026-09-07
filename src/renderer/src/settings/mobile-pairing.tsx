import { DevicePhoneMobileIcon } from "@heroicons/react/24/outline"
import { useEffect, useRef, useState } from "react"
import { Button } from "../ui/button"

type Status = "idle" | "scanning" | "failed"

const scanIntervalMs = 200
const cameraFailure = "A câmera não abriu. Permita o acesso à câmera ou leia o QR com o app de câmera do celular."

function pairingLink(text: string) {
  try {
    const url = new URL(text)

    if (url.origin !== location.origin || !new URLSearchParams(url.hash.slice(1)).has("token")) {
      return null
    }

    return url.href
  } catch {
    return null
  }
}

function decode(video: HTMLVideoElement, context: CanvasRenderingContext2D, jsQR: typeof import("jsqr").default) {
  const { videoWidth: width, videoHeight: height } = video

  if (!width) {
    return null
  }

  context.canvas.width = width
  context.canvas.height = height
  context.drawImage(video, 0, 0)

  return jsQR(context.getImageData(0, 0, width, height).data, width, height)?.data ?? null
}

async function readPairingLink(video: HTMLVideoElement, signal: AbortSignal) {
  const { default: jsQR } = await import("jsqr")
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 640 } } })
  const context = document.createElement("canvas").getContext("2d", { willReadFrequently: true })

  try {
    signal.throwIfAborted()

    if (!context) {
      throw new Error("Canvas indisponível")
    }

    video.srcObject = stream
    await video.play()

    while (!signal.aborted) {
      const text = decode(video, context, jsQR)
      const link = text && pairingLink(text)

      if (link) {
        return link
      }

      await new Promise((resolve) => setTimeout(resolve, scanIntervalMs))
    }

    return null
  } finally {
    stream.getTracks().forEach((track) => track.stop())
  }
}

export function MobilePairingRequired() {
  const [status, setStatus] = useState<Status>("idle")
  const video = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (status !== "scanning" || !video.current) {
      return
    }

    const controller = new AbortController()

    readPairingLink(video.current, controller.signal)
      .then((link) => link && location.assign(link))
      .catch(() => {
        if (!controller.signal.aborted) {
          setStatus("failed")
        }
      })

    return () => controller.abort()
  }, [status])

  return (
    <main className="flex h-dvh items-center justify-center bg-canvas p-6 text-center font-sans">
      <div className="flex w-full max-w-[40ch] flex-col items-center gap-3">
        {status === "scanning" ? (
          <>
            <video ref={video} playsInline muted className="aspect-square w-full max-w-72 rounded-2xl border border-outline bg-surface object-cover" />
            <p className="m-0 text-support text-secondary">Aponte para o QR na tela do notebook.</p>
            <Button variant="text" type="button" onClick={() => setStatus("idle")}>Cancelar</Button>
          </>
        ) : (
          <>
            <DevicePhoneMobileIcon className="size-8 text-muted" aria-hidden="true" />
            <h1 className="m-0 text-title font-semibold text-primary">Pareie este celular</h1>
            <p className="m-0 text-support text-secondary">No notebook, abra Configurações → Celular. Leia o QR aqui ou com o app de câmera do celular.</p>
            <Button type="button" className="mt-1" onClick={() => setStatus("scanning")}>Ler o QR com a câmera</Button>
            {status === "failed" && <p className="m-0 text-support text-status-error" role="alert">{cameraFailure}</p>}
          </>
        )}
      </div>
    </main>
  )
}
