"use client"

import { WorkspaceRatingCell, workspaceRatingFieldConfigs } from "@ood/ui"
import type { Dispatch, KeyboardEvent, SetStateAction } from "react"
import { useCallback, useEffect, useMemo, useRef } from "react"
import {
  type FlatRow,
  type WorkTreeNode,
  patchTreeRow,
} from "../../state/workspace-tree-state"
import {
  type EditState,
  buildEditState,
  useWorkItemEditing,
} from "../../work-item-editing"

export type UseWorkspaceEditingStateCompositionResult = {
  getEditForRow: (row: FlatRow) => EditState
  syncEditsRef: (edits: Record<string, EditState>) => void
}

export function useWorkspaceEditingStateComposition(
  rows: FlatRow[],
): UseWorkspaceEditingStateCompositionResult {
  const editsRef = useRef<Record<string, EditState>>({})
  const rowDefaultsById = useMemo(() => {
    const defaults = new Map<string, EditState>()
    for (const row of rows) {
      defaults.set(row.id, buildEditState(row))
    }
    return defaults
  }, [rows])

  const getEditForRow = useCallback(
    (row: FlatRow) =>
      editsRef.current[row.id] ??
      rowDefaultsById.get(row.id) ??
      buildEditState(row),
    [rowDefaultsById],
  )

  const syncEditsRef = useCallback((edits: Record<string, EditState>) => {
    editsRef.current = edits
  }, [])

  return {
    getEditForRow,
    syncEditsRef,
  }
}

type UseWorkspaceEditingCompositionOptions = {
  deleteRow: (id: string) => Promise<void>
  escapeCancellableRowId: string | null
  focusTitleInput: (rowId: string) => boolean
  isDev: boolean
  pendingFocusRowId: string | null
  reportError: Dispatch<SetStateAction<string>>
  rows: FlatRow[]
  rowsById: Map<string, FlatRow>
  saveRow: (id: string, payload: Record<string, unknown>) => Promise<unknown>
  scheduleTextColumnWidthRecalc: () => void
  setEscapeCancellableRowId: Dispatch<SetStateAction<string | null>>
  setPendingFocusRowId: Dispatch<SetStateAction<string | null>>
  setTree: Dispatch<SetStateAction<WorkTreeNode[]>>
  syncEditsRef: (edits: Record<string, EditState>) => void
  toErrorText: (error: unknown) => string
  onDiscardPendingSaveReady: (handler: (id: string) => void) => void
}

export function useWorkspaceEditingComposition(
  options: UseWorkspaceEditingCompositionOptions,
) {
  const {
    deleteRow,
    escapeCancellableRowId,
    focusTitleInput,
    isDev,
    pendingFocusRowId,
    reportError,
    rows,
    rowsById,
    saveRow,
    scheduleTextColumnWidthRecalc,
    setEscapeCancellableRowId,
    setPendingFocusRowId,
    setTree,
    syncEditsRef,
    toErrorText,
    onDiscardPendingSaveReady,
  } = options
  const patchLatenciesRef = useRef<number[]>([])
  const inputToPaintRef = useRef<number[]>([])

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
    reportError,
    saveRow,
    toErrorText,
    recordInputToPaint: (durationMs) => {
      inputToPaintRef.current.push(durationMs)
      if (inputToPaintRef.current.length > 40) {
        inputToPaintRef.current.shift()
      }
    },
    recordPatchLatency: (latency) => {
      patchLatenciesRef.current.push(latency)
      if (patchLatenciesRef.current.length > 40) {
        patchLatenciesRef.current.shift()
      }
    },
    scheduleTextColumnWidthRecalc,
  })

  useEffect(() => {
    syncEditsRef(edits)
  }, [edits, syncEditsRef])

  useEffect(() => {
    onDiscardPendingSaveReady(discardPendingSave)
  }, [discardPendingSave, onDiscardPendingSaveReady])

  useEffect(() => {
    if (!pendingFocusRowId) {
      return
    }
    if (focusTitleInput(pendingFocusRowId)) {
      setPendingFocusRowId(null)
    }
  }, [focusTitleInput, pendingFocusRowId, setPendingFocusRowId])

  const handleTitleBlur = useCallback(
    (rowId: string) => {
      setEscapeCancellableRowId((current) =>
        current === rowId ? null : current,
      )
    },
    [setEscapeCancellableRowId],
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
    [
      deleteRow,
      discardPendingSave,
      escapeCancellableRowId,
      setEscapeCancellableRowId,
    ],
  )

  const rowEdits = useMemo(() => {
    const next: Record<string, EditState> = {}
    for (const row of rows) {
      next[row.id] = edits[row.id] ?? buildEditState(row)
    }
    return next
  }, [edits, rows])

  const renderRatingCells = useCallback(
    ({
      edit,
      isParentRow,
      onCommitEdit,
      row,
    }: {
      edit: EditState
      isParentRow: boolean
      onCommitEdit: (patch: Partial<EditState>) => void
      row: FlatRow
    }) => (
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
    rowEdits,
    commitEdit,
    commitTextEdit,
    discardPendingSave,
    flushPendingEdits,
    handleFieldBlur,
    handleFieldFocus,
    handleTitleBlur,
    handleTitleKeyDown,
    renderRatingCells,
    patchLatenciesRef,
    inputToPaintRef,
  }
}
