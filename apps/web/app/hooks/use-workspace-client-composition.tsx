"use client"

import type { WorkspaceTreeTableProps } from "@ood/ui"
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import {
  buildTreeNumbering,
  flattenTree,
  patchTreeRow,
} from "../state/workspace-tree-state"
import {
  type FlatRowLike,
  type OverlayIndicator,
  buildInsertLanes,
  withLaneAnchors,
} from "../tree-interactions"
import { patchWorkItem } from "../work-item-client"
import {
  type EditState,
  buildEditState,
  useWorkItemEditing,
} from "../work-item-editing"
import {
  WorkspaceRatingCell,
  workspaceRatingFieldConfigs,
} from "../workspace-ratings"
import { useWorkspaceContext } from "../workspaces/use-workspace-context"
import { WorkspaceSwitcher } from "../workspaces/workspace-switcher"
import { useWorkspaceDragDrop } from "./use-workspace-drag-drop"
import {
  useTableFrameConstants,
  useWorkspaceLayout,
} from "./use-workspace-layout"
import { useWorkspaceTreeData } from "./use-workspace-tree-data"

const DEV_METRICS_SAMPLE_LIMIT = 40

function getMedian(values: number[]): number | null {
  if (values.length === 0) {
    return null
  }
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2
  }
  return sorted[middle]
}

export function useWorkspaceClientComposition() {
  const isDev = process.env.NODE_ENV !== "production"
  const {
    workspaces,
    currentWorkspace,
    currentWorkspaceId,
    errorText: workspaceErrorText,
    isCreating: isCreatingWorkspace,
    isLoading: isWorkspaceLoading,
    createWorkspace,
    openWorkspace,
  } = useWorkspaceContext()
  const [pendingFocusRowId, setPendingFocusRowId] = useState<string | null>(
    null,
  )
  const [escapeCancellableRowId, setEscapeCancellableRowId] = useState<
    string | null
  >(null)
  const patchLatenciesRef = useRef<number[]>([])
  const inputToPaintRef = useRef<number[]>([])
  const editsRef = useRef<Record<string, EditState>>({})
  const discardPendingSaveRef = useRef<(id: string) => void>(() => {})

  const {
    tree,
    setTree,
    isLoading,
    errorText,
    setErrorText,
    createRowAtPosition,
    deleteRow,
    moveRow,
    toErrorText,
    refreshCount,
  } = useWorkspaceTreeData({
    currentWorkspaceId,
    discardPendingSave: (id) => {
      discardPendingSaveRef.current(id)
    },
    isDev,
    onCreateFocusRow: (rowId) => {
      setPendingFocusRowId(rowId)
      setEscapeCancellableRowId(rowId)
    },
    onDeleteRow: (rowId) => {
      setEscapeCancellableRowId((current) =>
        current === rowId ? null : current,
      )
    },
  })

  const rows = useMemo(() => flattenTree(tree), [tree])
  const numberingById = useMemo(() => buildTreeNumbering(tree), [tree])
  const siblingsByParent = useMemo(() => {
    const map = new Map<string | null, typeof rows>()
    for (const row of rows) {
      const bucket = map.get(row.parentId) ?? []
      bucket.push(row)
      map.set(row.parentId, bucket)
    }
    for (const bucket of map.values()) {
      bucket.sort((a, b) => a.siblingOrder - b.siblingOrder)
    }
    return map
  }, [rows])
  const rowsById = useMemo(() => {
    const map = new Map<string, (typeof rows)[number]>()
    for (const row of rows) {
      map.set(row.id, row)
    }
    return map
  }, [rows])

  const layout = useWorkspaceLayout({
    getEditForRow: (row) => editsRef.current[row.id] ?? buildEditState(row),
    isDev,
    rows,
  })

  const {
    edits,
    commitEdit,
    commitTextEdit,
    discardPendingSave,
    flushPendingEdits,
    handleFieldBlur,
    handleFieldFocus,
  } = useWorkItemEditing({
    isDev,
    rows,
    rowsById,
    patchRow: (rowId, patch) => {
      setTree((currentTree) => patchTreeRow(currentTree, rowId, patch))
    },
    reportError: setErrorText,
    saveRow: patchWorkItem,
    toErrorText,
    recordInputToPaint: (durationMs) => {
      inputToPaintRef.current.push(durationMs)
      if (inputToPaintRef.current.length > DEV_METRICS_SAMPLE_LIMIT) {
        inputToPaintRef.current.shift()
      }
    },
    recordPatchLatency: (latency) => {
      patchLatenciesRef.current.push(latency)
      if (patchLatenciesRef.current.length > DEV_METRICS_SAMPLE_LIMIT) {
        patchLatenciesRef.current.shift()
      }
    },
    scheduleTextColumnWidthRecalc: layout.scheduleTextColumnWidthRecalc,
  })

  useEffect(() => {
    editsRef.current = edits
  }, [edits])

  useEffect(() => {
    discardPendingSaveRef.current = discardPendingSave
  }, [discardPendingSave])

  useEffect(() => {
    if (!pendingFocusRowId) {
      return
    }
    if (layout.focusTitleInput(pendingFocusRowId)) {
      setPendingFocusRowId(null)
    }
  }, [layout, pendingFocusRowId])

  const {
    FRAME_X_PX,
    LEFT_GUTTER_WIDTH_PX,
    WORK_CONTENT_INDENT_PX,
    CELL_INLINE_PAD_PX,
    STRUCTURE_LINE_WIDTH_PX,
    CONTENT_START_X_PX,
    TREE_LEVEL_OFFSET_PX,
  } = useTableFrameConstants()

  const dnd = useWorkspaceDragDrop({
    rowsById,
    siblingsByParent,
    scheduleOverlayRecalc: layout.scheduleOverlayRecalc,
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
    () =>
      withLaneAnchors(
        baseInsertLanes,
        layout.rowAnchors,
        layout.tableHeaderBottom,
      ),
    [baseInsertLanes, layout.rowAnchors, layout.tableHeaderBottom],
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
      parentId: lane.parentId,
      targetIndex: lane.targetIndex,
      showPlus: true,
    }))
  }, [dnd.interactionMode, dnd.isDragPrimed, visibleInsertLanes])
  const overlayDropY = useMemo(() => {
    const dropIntent = dnd.dropIntent
    if (dnd.interactionMode !== "dragging" || !dropIntent) {
      return null
    }
    if (dropIntent.type === "between") {
      const rowAnchor = layout.rowAnchors[dropIntent.rowId]
      if (!rowAnchor) {
        return null
      }
      return dropIntent.position === "before" ? rowAnchor.top : rowAnchor.bottom
    }
    if (dropIntent.type === "root-start") {
      const firstRootId = (siblingsByParent.get(null) ?? [])[0]?.id
      const rootTop = firstRootId
        ? layout.rowAnchors[firstRootId]?.top
        : undefined
      return rootTop ?? layout.tableHeaderBottom
    }
    return null
  }, [
    dnd.dropIntent,
    dnd.interactionMode,
    layout.rowAnchors,
    layout.tableHeaderBottom,
    siblingsByParent,
  ])

  useEffect(() => {
    if (!isDev || typeof window === "undefined") {
      return
    }
    const timer = window.setInterval(() => {
      const medianInputToPaint = getMedian(inputToPaintRef.current)
      const medianPatch = getMedian(patchLatenciesRef.current)
      console.debug(
        "[workspace perf]",
        JSON.stringify({
          overlayRecalcCount: layout.overlayRecalcCount,
          medianInputToPaintMs:
            medianInputToPaint === null
              ? null
              : Number(medianInputToPaint.toFixed(1)),
          medianPatchLatencyMs:
            medianPatch === null ? null : Number(medianPatch.toFixed(1)),
          refreshCount,
        }),
      )
    }, 5000)
    return () => {
      window.clearInterval(timer)
    }
  }, [isDev, layout.overlayRecalcCount, refreshCount])

  const handleTitleBlur = useCallback(
    (rowId: string) => {
      if (escapeCancellableRowId === rowId) {
        setEscapeCancellableRowId(null)
      }
    },
    [escapeCancellableRowId],
  )

  const handleTitleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>, rowId: string) => {
      if (event.key !== "Escape") {
        return
      }
      if (escapeCancellableRowId !== rowId) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      discardPendingSave(rowId)
      setEscapeCancellableRowId(null)
      void deleteRow(rowId)
    },
    [deleteRow, discardPendingSave, escapeCancellableRowId],
  )

  const handleOpenWorkspace = useCallback(
    (workspaceId: string) => {
      if (workspaceId === currentWorkspaceId) {
        return
      }
      flushPendingEdits()
      setErrorText("")
      openWorkspace(workspaceId)
    },
    [currentWorkspaceId, flushPendingEdits, openWorkspace, setErrorText],
  )

  const handleCreateWorkspace = useCallback(
    async (name: string) => {
      flushPendingEdits()
      setErrorText("")
      await createWorkspace(name)
    },
    [createWorkspace, flushPendingEdits, setErrorText],
  )

  const currentWorkspaceName = currentWorkspace?.name ?? "Рабочее пространство"
  const rowEdits = useMemo(() => {
    const next: Record<string, EditState> = {}
    for (const row of rows) {
      next[row.id] = edits[row.id] ?? buildEditState(row)
    }
    return next
  }, [edits, rows])

  const renderSwitcher = useCallback(
    ({
      currentWorkspaceId,
      isCreatingWorkspace,
      isWorkspaceLoading,
      workspaces,
    }: {
      currentWorkspaceId: string | null
      isCreatingWorkspace: boolean
      isWorkspaceLoading: boolean
      workspaces: { id: string; name: string }[]
    }) => (
      <WorkspaceSwitcher
        currentWorkspaceId={currentWorkspaceId}
        isCreating={isCreatingWorkspace}
        isLoading={isWorkspaceLoading}
        onCreateWorkspace={handleCreateWorkspace}
        onOpenWorkspace={handleOpenWorkspace}
        workspaces={workspaces}
      />
    ),
    [handleCreateWorkspace, handleOpenWorkspace],
  )

  const renderRatingCells = useCallback<
    WorkspaceTreeTableProps["renderRatingCells"]
  >(
    ({ edit, isParentRow, onCommitEdit, row }) => (
      <>
        <WorkspaceRatingCell
          field={workspaceRatingFieldConfigs[0]}
          row={row}
          editState={edit}
          isParentRow={isParentRow}
          onChange={(value) => onCommitEdit({ overcomplication: value })}
        />
        <WorkspaceRatingCell
          field={workspaceRatingFieldConfigs[1]}
          row={row}
          editState={edit}
          isParentRow={isParentRow}
          onChange={(value) => onCommitEdit({ importance: value })}
        />
        <WorkspaceRatingCell
          field={workspaceRatingFieldConfigs[2]}
          row={row}
          editState={edit}
          isParentRow={isParentRow}
          onChange={(value) => onCommitEdit({ blocksMoney: value })}
        />
      </>
    ),
    [],
  )

  return {
    currentWorkspaceId,
    isCreatingWorkspace,
    isWorkspaceLoading,
    workspaceErrorText,
    workspaces,
    currentWorkspaceName,
    errorText,
    isLoading,
    rows,
    numberingById,
    rowEdits,
    dnd,
    layout,
    overlayAddIndicators,
    overlayDropY,
    tableFrame: {
      FRAME_X_PX,
      LEFT_GUTTER_WIDTH_PX,
      WORK_CONTENT_INDENT_PX,
      CELL_INLINE_PAD_PX,
      STRUCTURE_LINE_WIDTH_PX,
      CONTENT_START_X_PX,
      TREE_LEVEL_OFFSET_PX,
    },
    handlers: {
      handleTitleBlur,
      handleTitleKeyDown,
      createRowAtPosition,
      deleteRow,
      commitTextEdit,
      commitEdit,
      handleFieldFocus,
      handleFieldBlur,
      renderSwitcher,
      renderRatingCells,
    },
    workspaceRatingFieldConfigs,
  }
}
