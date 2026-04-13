"use client"

import type { RefObject } from "react"

type ViewportScrollbarProps = {
  show: boolean
  width: number
  scrollbarRef: RefObject<HTMLDivElement>
}

export function ViewportScrollbar(props: ViewportScrollbarProps) {
  return (
    <div className={`viewport-scrollbar${props.show ? " is-visible" : ""}`}>
      <div className="viewport-scrollbar-track" ref={props.scrollbarRef}>
        <div
          className="viewport-scrollbar-spacer"
          style={{ width: `${props.width}px` }}
        />
      </div>
    </div>
  )
}
