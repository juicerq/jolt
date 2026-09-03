import type { SVGProps } from "react"

export function BrainIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.5 4A2.5 2.5 0 0 1 12 6.5v11a2.5 2.5 0 0 1-4.96.44A2.5 2.5 0 0 1 5.5 13.5a3 3 0 0 1 .34-5.87A2.5 2.5 0 0 1 9.5 4Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.5 4A2.5 2.5 0 0 0 12 6.5v11a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 1.54-4.44 3 3 0 0 0-.34-5.87A2.5 2.5 0 0 0 14.5 4Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 8.5c1.75 0 2.75 1 2.75 2.5M16 8.5c-1.75 0-2.75 1-2.75 2.5M8.5 14c1.5 0 2.25.75 2.25 2M15.5 14c-1.5 0-2.25.75-2.25 2" />
    </svg>
  )
}
