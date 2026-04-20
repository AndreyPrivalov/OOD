export type FlatRowLike = {
  id: string
  parentId: string | null
  depth: number
  siblingOrder: number
}

export type DropIntent =
  | {
      type: "nest"
      targetId: string
    }
  | {
      type: "between"
      rowId: string
      position: "before" | "after"
      parentId: string | null
      targetIndex: number
    }
  | {
      type: "root-start"
      targetIndex: number
    }

export type InteractionMode = "idle" | "dragging"

export type InsertLane = {
  id: string
  parentId: string | null
  depth: number
  targetIndex: number
  anchorRowId: string | null
  anchorPlacement: "before" | "after-last" | "empty"
  anchorY: number | null
}

export type OverlayIndicator = {
  kind: "add" | "drop"
  laneId: string
  y: number
  contentStartXPx: number
  parentId: string | null
  targetIndex: number
  showPlus: boolean
}

export type RowAnchor = {
  top: number
  bottom: number
}
