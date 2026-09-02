import { evaluate, percentile } from "./browser"

export type Probe = {
  keys: { delay: number; paint: number }[]
  frames: number[]
  longFrames: { duration: number; scriptMs: number; renderMs: number }[]
}

const slowFrameMs = 34

export function startProbe() {
  evaluate<string>(`(() => {
    const probe = { keys: [], frames: [], longFrames: [], last: performance.now() }
    const frame = (now) => { probe.frames.push(now - probe.last); probe.last = now; probe.raf = requestAnimationFrame(frame) }
    probe.raf = requestAnimationFrame(frame)
    probe.observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        probe.longFrames.push({ duration: entry.duration, scriptMs: entry.renderStart - entry.startTime, renderMs: entry.startTime + entry.duration - entry.renderStart })
      }
    })
    probe.observer.observe({ type: "long-animation-frame" })
    probe.onKey = (event) => {
      const delay = performance.now() - event.timeStamp
      requestAnimationFrame(() => setTimeout(() => probe.keys.push({ delay, paint: performance.now() - event.timeStamp })))
    }
    document.addEventListener("keydown", probe.onKey, true)
    window.__joltProbe = probe
    return JSON.stringify("started")
  })()`)
}

export function stopProbe() {
  return evaluate<Probe>(`(() => {
    const probe = window.__joltProbe
    cancelAnimationFrame(probe.raf)
    probe.observer.disconnect()
    document.removeEventListener("keydown", probe.onKey, true)
    delete window.__joltProbe
    return JSON.stringify({ keys: probe.keys, frames: probe.frames, longFrames: probe.longFrames })
  })()`)
}

export function summarizeFrames({ frames, longFrames }: Pick<Probe, "frames" | "longFrames">) {
  const worst = longFrames.toSorted((left, right) => right.duration - left.duration)[0]

  return {
    frames: frames.length,
    slowFrames: frames.filter((interval) => interval > slowFrameMs).length,
    frameP95: Math.round(percentile(frames, 0.95)),
    frameMax: Math.round(Math.max(0, ...frames)),
    longFrames: longFrames.length,
    longFrameMax: Math.round(worst?.duration ?? 0),
    longFrameScriptMs: Math.round(worst?.scriptMs ?? 0),
    longFrameRenderMs: Math.round(worst?.renderMs ?? 0),
  }
}

export function summarizeKeys(keys: Probe["keys"]) {
  return {
    keys: keys.length,
    delayP50: Math.round(percentile(keys.map((key) => key.delay), 0.5)),
    delayP95: Math.round(percentile(keys.map((key) => key.delay), 0.95)),
    paintP50: Math.round(percentile(keys.map((key) => key.paint), 0.5)),
    paintP95: Math.round(percentile(keys.map((key) => key.paint), 0.95)),
    paintMax: Math.round(Math.max(0, ...keys.map((key) => key.paint))),
  }
}
