import type { RefObject } from "react"

type ViewportScrollbarProps = {
  show: boolean
  width: number
  scrollbarRef?: RefObject<HTMLDivElement>
  className?: string
}

export function ViewportScrollbar(props: ViewportScrollbarProps) {
  const className = [
    "viewport-scrollbar",
    props.show ? "is-visible" : "",
    props.className ?? "",
  ]
    .filter(Boolean)
    .join(" ")

  return (
    <div className={className}>
      <div className="viewport-scrollbar-track" ref={props.scrollbarRef}>
        <div
          className="viewport-scrollbar-spacer"
          style={{ width: `${props.width}px` }}
        />
      </div>
    </div>
  )
}
