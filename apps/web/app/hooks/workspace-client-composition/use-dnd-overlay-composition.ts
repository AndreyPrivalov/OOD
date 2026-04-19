"use client"

import { useMemo } from "react"
import type { FlatRow } from "../../state/workspace-tree-state"
import {
  type FlatRowLike,
  type OverlayIndicator,
  buildInsertLanes,
  withLaneAnchors,
} from "../../tree-interactions"
import { useWorkspaceDragDrop } from "../use-workspace-drag-drop"

type UseWorkspaceDndOverlayCompositionOptions = {
  contentStartXPx: number
  moveRow: (
    id: string,
    targetParentId: string | null,
    targetIndex: number,
  ) => Promise<void>
  rowAnchors: Record<string, { top: number; bottom: number }>
  rows: FlatRow[]
  rowsById: Map<string, FlatRow>
  rowTreeIndentPx: number
  scheduleOverlayRecalc: () => void
  siblingsByParent: Map<string | null, FlatRow[]>
  tableHeaderBottom: number
}

export function useWorkspaceDndOverlayComposition(
  options: UseWorkspaceDndOverlayCompositionOptions,
) {
  const {
    contentStartXPx,
    moveRow,
    rowAnchors,
    rows,
    rowsById,
    rowTreeIndentPx,
    scheduleOverlayRecalc,
    siblingsByParent,
    tableHeaderBottom,
  } = options

  const dnd = useWorkspaceDragDrop({
    rowsById,
    siblingsByParent,
    scheduleOverlayRecalc,
    moveRow,
  })

  const baseInsertLanes = useMemo(
    () =>
      buildInsertLanes(
        rows,
        siblingsByParent as Map<string | null, FlatRowLike[]>,
      ),
    [rows, siblingsByParent],
  )

  const insertLanes = useMemo(
    () => withLaneAnchors(baseInsertLanes, rowAnchors, tableHeaderBottom),
    [baseInsertLanes, rowAnchors, tableHeaderBottom],
  )

  const visibleInsertLanes = useMemo(
    () => insertLanes.filter((lane) => lane.anchorY !== null),
    [insertLanes],
  )

  const overlayAddIndicators = useMemo<OverlayIndicator[]>(() => {
    if (dnd.interactionMode !== "idle" || dnd.isDragPrimed) {
      return []
    }
    return visibleInsertLanes.map((lane) => ({
      kind: "add",
      laneId: lane.id,
      y: lane.anchorY ?? 0,
      contentStartXPx:
        contentStartXPx + Math.max(0, lane.depth) * rowTreeIndentPx,
      parentId: lane.parentId,
      targetIndex: lane.targetIndex,
      showPlus: true,
    }))
  }, [
    contentStartXPx,
    dnd.interactionMode,
    dnd.isDragPrimed,
    rowTreeIndentPx,
    visibleInsertLanes,
  ])

  const overlayDropY = useMemo(() => {
    const dropIntent = dnd.dropIntent
    if (dnd.interactionMode !== "dragging" || !dropIntent) {
      return null
    }
    if (dropIntent.type === "between") {
      const rowAnchor = rowAnchors[dropIntent.rowId]
      if (!rowAnchor) {
        return null
      }
      return dropIntent.position === "before" ? rowAnchor.top : rowAnchor.bottom
    }
    if (dropIntent.type === "root-start") {
      const firstRootId = (siblingsByParent.get(null) ?? [])[0]?.id
      const rootTop = firstRootId ? rowAnchors[firstRootId]?.top : undefined
      return rootTop ?? tableHeaderBottom
    }
    return null
  }, [
    dnd.dropIntent,
    dnd.interactionMode,
    rowAnchors,
    siblingsByParent,
    tableHeaderBottom,
  ])

  return {
    dnd,
    overlayAddIndicators,
    overlayDropY,
  }
}
