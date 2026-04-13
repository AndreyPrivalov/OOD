"use client"

import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { ViewportScrollbar } from "./components/tree/viewport-scrollbar"
import { WorkspaceTreeTable } from "./components/tree/workspace-tree-table"
import {
  WorkspaceControlPanel,
  WorkspaceTitlePanel,
} from "./components/workspace/workspace-panels"
import { useWorkspaceDragDrop } from "./hooks/use-workspace-drag-drop"
import {
  useTableFrameConstants,
  useWorkspaceLayout,
} from "./hooks/use-workspace-layout"
import { useWorkspaceTreeData } from "./hooks/use-workspace-tree-data"
import {
  buildTreeNumbering,
  flattenTree,
  patchTreeRow,
} from "./state/workspace-tree-state"
import {
  type FlatRowLike,
  type OverlayIndicator,
  buildInsertLanes,
  withLaneAnchors,
} from "./tree-interactions"
import {
  type EditState,
  buildEditState,
  useWorkItemEditing,
} from "./use-work-item-editing"
import { patchWorkItem } from "./work-item-client"
import { useWorkspaceContext } from "./workspaces/use-workspace-context"

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

export function WorkspaceClient() {
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

  function handleTitleBlur(rowId: string) {
    if (escapeCancellableRowId === rowId) {
      setEscapeCancellableRowId(null)
    }
  }

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

  function handleOpenWorkspace(workspaceId: string) {
    if (workspaceId === currentWorkspaceId) {
      return
    }
    flushPendingEdits()
    setErrorText("")
    openWorkspace(workspaceId)
  }

  async function handleCreateWorkspace(name: string) {
    flushPendingEdits()
    setErrorText("")
    await createWorkspace(name)
  }

  const currentWorkspaceName = currentWorkspace?.name ?? "Рабочее пространство"
  const rowEdits = useMemo(() => {
    const next: Record<string, EditState> = {}
    for (const row of rows) {
      next[row.id] = edits[row.id] ?? buildEditState(row)
    }
    return next
  }, [edits, rows])

  return (
    <main>
      <div className="workspace">
        <WorkspaceControlPanel
          currentWorkspaceId={currentWorkspaceId}
          isCreatingWorkspace={isCreatingWorkspace}
          isWorkspaceLoading={isWorkspaceLoading}
          workspaceErrorText={workspaceErrorText}
          workspaces={workspaces}
          onCreateWorkspace={handleCreateWorkspace}
          onOpenWorkspace={handleOpenWorkspace}
        />
        <WorkspaceTitlePanel
          currentWorkspaceName={currentWorkspaceName}
          errorText={errorText}
        />
        <section className="section">
          {isLoading ? <p className="list-loading">Загрузка</p> : null}
          {!isLoading && rows.length === 0 ? (
            <p className="list-empty">Пусто</p>
          ) : null}
          <WorkspaceTreeTable
            rows={rows}
            edits={rowEdits}
            numberingById={numberingById}
            draggedRowId={dnd.draggedRowId}
            dropIntent={dnd.dropIntent}
            tableColumnWidths={layout.tableColumnWidths}
            rowTreeIndentPx={TREE_LEVEL_OFFSET_PX}
            workContentIndentPx={WORK_CONTENT_INDENT_PX}
            contentStartXPx={CONTENT_START_X_PX}
            frameXPx={FRAME_X_PX}
            leftGutterWidthPx={LEFT_GUTTER_WIDTH_PX}
            cellInlinePadPx={CELL_INLINE_PAD_PX}
            structureLineWidthPx={STRUCTURE_LINE_WIDTH_PX}
            overlayHeight={layout.overlayHeight}
            overlayAddIndicators={overlayAddIndicators}
            overlayDropY={overlayDropY}
            listScrollRef={layout.listScrollRef}
            tableWrapRef={layout.tableWrapRef}
            tableRef={layout.tableRef}
            registerRowElementRef={layout.registerRowElementRef}
            registerTitleInputRef={layout.registerTitleInputRef}
            registerTextareaRef={layout.registerTextareaRef}
            onHandlePointerDown={dnd.handleHandlePointerDown}
            onHandlePointerMove={dnd.handleHandlePointerMove}
            onHandlePointerUp={dnd.handleHandlePointerUp}
            onHandlePointerCancel={dnd.handleHandlePointerCancel}
            onCreateAtPosition={(parentId, targetIndex) => {
              void createRowAtPosition(parentId, targetIndex)
            }}
            onDeleteRow={(rowId) => {
              void deleteRow(rowId)
            }}
            onCommitTextEdit={commitTextEdit}
            onCommitEdit={commitEdit}
            onFieldFocus={handleFieldFocus}
            onFieldBlur={handleFieldBlur}
            onTitleKeyDown={handleTitleKeyDown}
            onTitleBlurExtra={handleTitleBlur}
          />
        </section>
      </div>
      <ViewportScrollbar
        show={layout.showViewportScrollbar}
        width={layout.viewportScrollbarWidth}
        scrollbarRef={layout.viewportScrollbarRef}
      />
    </main>
  )
}
