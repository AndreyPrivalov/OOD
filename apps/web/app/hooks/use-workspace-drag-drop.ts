"use client"

import {
  type PointerEvent,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react"
import type { FlatRow } from "../state/workspace-tree-state"
import {
  type DropIntent,
  type FlatRowLike,
  type InteractionMode,
  isSameDropIntent,
  resolveDropIntentAtPoint,
} from "../tree-interactions"

type PointerDragState = {
  activeId: string
  pointerId: number
  startX: number
  startY: number
  isDragging: boolean
  intent: DropIntent | null
}

const DRAG_START_DISTANCE = 5
const LEFT_GUTTER_WIDTH_PX = 84

type UseWorkspaceDragDropOptions = {
  rowsById: Map<string, FlatRow>
  siblingsByParent: Map<string | null, FlatRow[]>
  scheduleOverlayRecalc: () => void
  moveRow: (
    id: string,
    targetParentId: string | null,
    targetIndex: number,
  ) => Promise<void>
}

export function useWorkspaceDragDrop(options: UseWorkspaceDragDropOptions) {
  const { moveRow, rowsById, scheduleOverlayRecalc, siblingsByParent } = options
  const [dragState, setDragState] = useState<PointerDragState | null>(null)
  const dragStateRef = useRef<PointerDragState | null>(null)

  const updateDragState = useCallback((next: PointerDragState | null) => {
    dragStateRef.current = next
    setDragState(next)
  }, [])

  const resetDragState = useCallback(() => {
    updateDragState(null)
  }, [updateDragState])

  const commitDrop = useCallback(
    async (activeId: string, intent: DropIntent | null) => {
      if (!intent) return
      if (intent.type === "nest") {
        if (intent.targetId === activeId) return
        const parentNode = rowsById.get(intent.targetId)
        if (!parentNode) return
        const targetIndex = parentNode.children.filter(
          (child) => child.id !== activeId,
        ).length
        await moveRow(activeId, intent.targetId, targetIndex)
        return
      }
      if (intent.type === "between") {
        await moveRow(activeId, intent.parentId, intent.targetIndex)
        return
      }
      if (intent.type === "root-start") {
        await moveRow(activeId, null, 0)
      }
    },
    [moveRow, rowsById],
  )

  const handleHandlePointerDown = useCallback(
    (event: PointerEvent<HTMLButtonElement>, rowId: string) => {
      if (event.button !== 0) return
      event.preventDefault()
      event.stopPropagation()
      scheduleOverlayRecalc()
      event.currentTarget.setPointerCapture(event.pointerId)
      updateDragState({
        activeId: rowId,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        isDragging: false,
        intent: null,
      })
    },
    [scheduleOverlayRecalc, updateDragState],
  )

  const handleHandlePointerMove = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      const current = dragStateRef.current
      if (!current || current.pointerId !== event.pointerId) {
        return
      }
      const deltaX = event.clientX - current.startX
      const deltaY = event.clientY - current.startY
      const distance = Math.hypot(deltaX, deltaY)
      if (!current.isDragging && distance < DRAG_START_DISTANCE) {
        return
      }
      event.preventDefault()
      const nextIntent = resolveDropIntentAtPoint({
        clientX: event.clientX,
        clientY: event.clientY,
        movingId: current.activeId,
        rowsById: rowsById as Map<string, FlatRowLike>,
        siblingsByParent: siblingsByParent as Map<string | null, FlatRowLike[]>,
        gutterWidth: LEFT_GUTTER_WIDTH_PX,
      })
      const nextState: PointerDragState = {
        ...current,
        isDragging: true,
        intent: nextIntent,
      }
      if (
        current.isDragging !== nextState.isDragging ||
        !isSameDropIntent(current.intent, nextState.intent)
      ) {
        updateDragState(nextState)
      }
    },
    [rowsById, siblingsByParent, updateDragState],
  )

  const handleHandlePointerUp = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      const current = dragStateRef.current
      if (!current || current.pointerId !== event.pointerId) {
        return
      }
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      resetDragState()
      if (!current.isDragging) {
        return
      }
      void commitDrop(current.activeId, current.intent)
    },
    [commitDrop, resetDragState],
  )

  const handleHandlePointerCancel = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      const current = dragStateRef.current
      if (!current || current.pointerId !== event.pointerId) {
        return
      }
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      resetDragState()
    },
    [resetDragState],
  )

  const draggedRowId = dragState?.isDragging ? dragState.activeId : null
  const dropIntent = dragState?.isDragging ? dragState.intent : null
  const isDragging = Boolean(dragState?.isDragging)
  const isDragPrimed = dragState !== null
  const interactionMode: InteractionMode = isDragging ? "dragging" : "idle"

  return {
    dragState,
    draggedRowId,
    dropIntent,
    isDragPrimed,
    interactionMode,
    handleHandlePointerDown,
    handleHandlePointerMove,
    handleHandlePointerUp,
    handleHandlePointerCancel,
  }
}
