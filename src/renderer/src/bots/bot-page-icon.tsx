import { palette, traits } from "blobatar"
import { idleSeeds } from "blobatar/idle"
import type { CSSProperties, ReactNode } from "react"
import type { BotPageName } from "./bot-route-titles"

const pageFigures = {
  settings: SettingsFigure,
  routines: RoutineFigure,
  routine: RoutineFigure,
  triggers: TriggerFigure,
  trigger: TriggerFigure,
  members: MembersFigure,
  memory: MemoryFigure,
  archive: ArchiveFigure,
  details: DetailsFigure,
} satisfies Record<BotPageName, () => ReactNode>

/** Page silhouettes share the Bot's palette and the same CSS breath, glances and blinks. */
export function BotPageIcon({ page, seed }: { page: BotPageName; seed: string }) {
  const identity = traits(seed)
  const colors = palette(identity.num("hue", 0, 360), true, identity("tone"))
  const motion = idleSeeds(`${seed}:${page}`)
  const Figure = pageFigures[page]
  const style: CSSProperties & Record<`--${string}`, string | number | undefined> = {
    color: colors.head,
    "--mo-head": colors.head,
    "--mo-eye": colors.eye,
    "--mo-phase": `${-motion.phase}ms`,
    "--mo-blink": `${motion.blink}ms`,
    "--mo-blink-phase": `${-motion.blinkPhase}ms`,
    "--mo-saccade": `${motion.saccade}ms`,
    "--mo-saccade-phase": `${-motion.saccadePhase}ms`,
    "--mo-look-x": motion.lookX,
    "--mo-look-y": motion.lookY,
  }

  return (
    <span className="bot-face inline-flex size-16 shrink-0" style={style} aria-hidden="true">
      <span className="relative inline-flex size-full">
        <svg className="size-full" viewBox="0 0 100 100" fill="currentColor" focusable="false">
          <g className="mo-breathe"><g className="mo-bob"><Figure /></g></g>
        </svg>
      </span>
    </span>
  )
}

function FigureEyes({ x = 50, y = 51 }: { x?: number; y?: number }) {
  return <g className="mo-eyes" fill="var(--mo-eye)">
    {[-1, 1].map((side) => {
      const style: CSSProperties & Record<`--${string}`, number> = { transformOrigin: `${x + side * 7}px ${y}px`, "--mo-wrap": side, "--mo-lean": side * -3 }

      return <g key={side} className="mo-eye" style={style}>
        <rect x={x + side * 7 - 2.8} y={y - 6.5} width="5.6" height="13" rx="2.8" transform={`rotate(${side * -3} ${x + side * 7} ${y})`} />
      </g>
    })}
  </g>
}

function SettingsFigure() {
  return <>
    <g>
      {Array.from({ length: 8 }, (_, tooth) => <rect key={tooth} x="42" y="12" width="16" height="22" rx="5" transform={`rotate(${tooth * 45} 50 50)`} />)}
      <circle cx="50" cy="50" r="29" />
    </g>
    <FigureEyes />
  </>
}

function RoutineFigure() {
  return <>
    <g>
      <rect x="24" y="71" width="10" height="15" rx="5" transform="rotate(24 29 76)" />
      <rect x="66" y="71" width="10" height="15" rx="5" transform="rotate(-24 71 76)" />
      <path d="M17 29Q9 22 20 15Q32 8 38 19ZM62 19Q68 8 80 15Q91 22 83 29Z" />
      <circle cx="50" cy="50" r="32" />
    </g>
    <path d="M50 61V67L59 71" fill="none" stroke="var(--mo-eye)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    <FigureEyes y={44} />
  </>
}

function TriggerFigure() {
  return <>
    <path d="M55 12Q61 8 59 17L55 34H74Q82 34 77 41L43 86Q37 94 39 82L43 63H24Q17 63 22 55Z" />
    <FigureEyes y={49} />
  </>
}

function MembersFigure() {
  return <>
    <g opacity="0.65">
      <path d="M10 61V50Q10 36 23 36Q36 36 36 50V65Q19 72 10 61Z" />
      <circle cx="23" cy="27" r="10" />
      <path d="M64 65V50Q64 36 77 36Q90 36 90 50V61Q81 72 64 65Z" />
      <circle cx="77" cy="27" r="10" />
    </g>
    <path d="M26 68V58Q26 41 50 41Q74 41 74 58V68Q74 84 50 84Q26 84 26 68Z" />
    <circle cx="50" cy="27" r="14" />
    <FigureEyes y={62} />
  </>
}

function MemoryFigure() {
  return <>
    <path d="M50 20C39 9 24 17 25 28C12 27 10 42 16 49C7 60 15 76 28 75C32 88 47 86 50 78C53 86 68 88 72 75C85 76 93 60 84 49C90 42 88 27 75 28C76 17 61 9 50 20Z" />
    <g fill="none" stroke="var(--mo-eye)" strokeWidth="2.5" strokeLinecap="round" opacity="0.3">
      <path d="M50 23V35M29 30Q39 29 38 37M71 30Q61 29 62 37M23 58Q32 59 30 68M77 58Q68 59 70 68M50 69V78" />
    </g>
    <FigureEyes />
  </>
}

function ArchiveFigure() {
  return <>
    <path d="M13 32Q13 23 22 23H39Q43 23 47 29L51 34H79Q87 34 87 43V69Q87 79 77 79H23Q13 79 13 69Z" opacity="0.65" />
    <path d="M19 40H81Q88 40 87 48L84 71Q83 79 75 79H25Q17 79 16 71L13 48Q12 40 19 40Z" />
    <FigureEyes y={58} />
  </>
}

function DetailsFigure() {
  return <>
    <rect x="12" y="21" width="76" height="58" rx="15" />
    <g transform="translate(7 6) scale(0.78)"><FigureEyes x={38} y={54} /></g>
    <path d="M58 43H75M58 53H70M28 67H70" fill="none" stroke="var(--mo-eye)" strokeWidth="3" strokeLinecap="round" opacity="0.4" />
  </>
}
