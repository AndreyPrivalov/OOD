"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { buildEditState, isSameEditState } from "./edit-state"
import {
  buildRowPatchFromPayload,
  buildRowPatchFromServer,
} from "./reconciliation"
import { buildPatchPayload } from "./save-payload"
import { LocalFirstRowQueue, type RevisionedValue } from "./save-queue"
import { readSaveRowDeferredError } from "./save-result"
import type {
  EditState,
  EditableWorkItemPatch,
  EditableWorkItemRow,
  RowEditMeta,
  RowEditPatch,
} from "./types"

type UseWorkItemEditingOptions<Row extends EditableWorkItemRow> = {
  isDev: boolean
  rows: Row[]
  rowsById: Map<string, Row>
  patchRow: (rowId: string, patch: EditableWorkItemPatch) => void
  onPersistedChange?: (
    change:
      | { kind: "patch"; before: Row; after: Row }
      | { kind: "create"; before: Row; after: Row },
  ) => void
  reportError: (message: string) => void
  saveRow: (id: string, payload: Record<string, unknown>) => Promise<unknown>
  toErrorText: (error: unknown) => string
  recordInputToPaint: (durationMs: number) => void
  recordPatchLatency?: (durationMs: number) => void
  scheduleTextColumnWidthRecalc: () => void
}

export function useWorkItemEditing<Row extends EditableWorkItemRow>(
  options: UseWorkItemEditingOptions<Row>,
) {
  const {
    isDev,
    rows,
    rowsById,
    patchRow,
    onPersistedChange,
    reportError,
    saveRow,
    toErrorText,
    recordInputToPaint,
    recordPatchLatency,
    scheduleTextColumnWidthRecalc,
  } = options
  const [edits, setEdits] = useState<Record<string, EditState>>({})
  const rowQueuesRef = useRef<Map<string, LocalFirstRowQueue<EditState>>>(
    new Map(),
  )
  const rowMetaRef = useRef<Map<string, RowEditMeta>>(new Map())
  const editsRef = useRef<Record<string, EditState>>({})
  const rowsByIdRef = useRef(rowsById)
  rowsByIdRef.current = rowsById

  useEffect(() => {
    editsRef.current = edits
  }, [edits])

  const getRowQueue = useCallback((rowId: string) => {
    const existing = rowQueuesRef.current.get(rowId)
    if (existing) {
      return existing
    }
    const created = new LocalFirstRowQueue<EditState>()
    rowQueuesRef.current.set(rowId, created)
    return created
  }, [])

  const getRowMeta = useCallback((rowId: string) => {
    const existing = rowMetaRef.current.get(rowId)
    if (existing) {
      return existing
    }
    const created: RowEditMeta = {
      isDirty: false,
      isFocused: false,
      hasUnackedChanges: false,
    }
    rowMetaRef.current.set(rowId, created)
    return created
  }, [])

  const discardPendingSave = useCallback((id: string) => {
    const queue = rowQueuesRef.current.get(id)
    queue?.clearQueued()
  }, [])

  const remapRowState = useCallback((fromRowId: string, toRowId: string) => {
    if (fromRowId === toRowId) {
      return
    }

    const queue = rowQueuesRef.current.get(fromRowId)
    if (queue) {
      rowQueuesRef.current.delete(fromRowId)
      rowQueuesRef.current.set(toRowId, queue)
    }

    const meta = rowMetaRef.current.get(fromRowId)
    if (meta) {
      rowMetaRef.current.delete(fromRowId)
      rowMetaRef.current.set(toRowId, meta)
    }

    setEdits((current) => {
      if (!(fromRowId in current)) {
        return current
      }
      const fromEdit = current[fromRowId]
      const next = { ...current }
      delete next[fromRowId]
      if (!(toRowId in next)) {
        next[toRowId] = fromEdit
      }
      return next
    })
  }, [])

  const markRowCleanIfSettled = useCallback(
    (id: string) => {
      const queue = rowQueuesRef.current.get(id)
      const meta = getRowMeta(id)
      const hasPending = queue?.hasPending() ?? false
      if (!hasPending && !meta.isFocused && !meta.hasUnackedChanges) {
        meta.isDirty = false
      }
    },
    [getRowMeta],
  )

  const runRowSaveRequest = useCallback(
    async (
      id: string,
      request: RevisionedValue<EditState>,
      fallbackRow?: Row,
    ) => {
      let activeRowId = id
      const queue = getRowQueue(id)
      const currentRow = rowsByIdRef.current.get(activeRowId) ?? fallbackRow
      if (!currentRow) {
        const ackResult = queue.acknowledge(request.revision)
        const meta = getRowMeta(activeRowId)
        if (ackResult.acknowledged && !queue.hasPending()) {
          meta.hasUnackedChanges = false
        }
        if (ackResult.nextRequest) {
          void runRowSaveRequest(activeRowId, ackResult.nextRequest)
        }
        markRowCleanIfSettled(activeRowId)
        return
      }

      const payload = buildPatchPayload(currentRow, request.value)
      if (Object.keys(payload).length === 0) {
        const ackResult = queue.acknowledge(request.revision)
        const meta = getRowMeta(activeRowId)
        if (ackResult.acknowledged && !queue.hasPending()) {
          meta.hasUnackedChanges = false
        }
        if (ackResult.nextRequest) {
          void runRowSaveRequest(activeRowId, ackResult.nextRequest, currentRow)
        }
        markRowCleanIfSettled(activeRowId)
        return
      }

      const startedAt =
        isDev && typeof performance !== "undefined" ? performance.now() : 0

      try {
        const saveResult = await saveRow(activeRowId, payload)
        const deferredSaveError = readSaveRowDeferredError(saveResult)
        const updated =
          saveResult && typeof saveResult === "object"
            ? (saveResult as Partial<Row>)
            : null
        const updatedId =
          updated && typeof updated === "object" && "id" in updated
            ? updated.id
            : undefined
        const nextRowId =
          typeof updatedId === "string" && updatedId.length > 0
            ? updatedId
            : activeRowId

        if (isDev && typeof performance !== "undefined") {
          const latency = Math.max(0, performance.now() - startedAt)
          recordPatchLatency?.(latency)
        }

        const ackResult = queue.acknowledge(request.revision)
        const meta = getRowMeta(activeRowId)
        if (ackResult.acknowledged && !queue.hasPending()) {
          meta.hasUnackedChanges = false
        }

        if (!ackResult.stale && ackResult.shouldApply && updated) {
          const serverPatch = buildRowPatchFromServer(updated)
          const localPayloadPatch = buildRowPatchFromPayload(payload)
          const mergedPatch = { ...serverPatch, ...localPayloadPatch }
          if (Object.keys(mergedPatch).length > 0) {
            patchRow(activeRowId, mergedPatch)
          }
        } else if (!ackResult.stale && ackResult.shouldApply) {
          const localPayloadPatch = buildRowPatchFromPayload(payload)
          if (Object.keys(localPayloadPatch).length > 0) {
            patchRow(activeRowId, localPayloadPatch)
          }
        }

        if (nextRowId !== activeRowId) {
          remapRowState(activeRowId, nextRowId)
        }

        const nextRowSnapshot = {
          ...currentRow,
          ...updated,
          id: activeRowId,
        } as Row
        const persistedRowSnapshot = {
          ...nextRowSnapshot,
          id: nextRowId,
        } as Row

        if (!ackResult.stale && ackResult.shouldApply) {
          if (nextRowId !== activeRowId) {
            onPersistedChange?.({
              kind: "create",
              before: currentRow,
              after: persistedRowSnapshot,
            })
          } else {
            onPersistedChange?.({
              kind: "patch",
              before: currentRow,
              after: persistedRowSnapshot,
            })
          }
        }

        if (nextRowId !== activeRowId) {
          activeRowId = nextRowId
        }

        if (ackResult.nextRequest) {
          void runRowSaveRequest(
            activeRowId,
            ackResult.nextRequest,
            nextRowSnapshot,
          )
        }
        if (deferredSaveError) {
          reportError(toErrorText(deferredSaveError))
        } else {
          reportError("")
        }
        markRowCleanIfSettled(activeRowId)
      } catch (error) {
        const nextRequest = queue.fail(request.revision)
        if (nextRequest) {
          void runRowSaveRequest(activeRowId, nextRequest, currentRow)
        }
        reportError(toErrorText(error))
      }
    },
    [
      getRowMeta,
      getRowQueue,
      isDev,
      markRowCleanIfSettled,
      onPersistedChange,
      patchRow,
      reportError,
      recordPatchLatency,
      remapRowState,
      saveRow,
      toErrorText,
    ],
  )

  const startQueuedSave = useCallback(
    (id: string) => {
      const queue = getRowQueue(id)
      const nextRequest = queue.startNext()
      if (!nextRequest) {
        markRowCleanIfSettled(id)
        return
      }
      void runRowSaveRequest(id, nextRequest)
    },
    [getRowQueue, markRowCleanIfSettled, runRowSaveRequest],
  )

  const persistRowEdit = useCallback(
    (id: string, nextEdit: EditState) => {
      const queue = getRowQueue(id)
      queue.enqueue(nextEdit)
      const meta = getRowMeta(id)
      meta.isDirty = true
      meta.hasUnackedChanges = true
      startQueuedSave(id)
    },
    [getRowMeta, getRowQueue, startQueuedSave],
  )

  const persistCurrentEdit = useCallback(
    (id: string) => {
      const currentRow = rowsByIdRef.current.get(id)
      if (!currentRow) {
        return
      }
      const nextEdit = editsRef.current[id] ?? buildEditState(currentRow)
      persistRowEdit(id, nextEdit)
    },
    [persistRowEdit],
  )

  const flushPendingEdits = useCallback(() => {
    for (const [rowId, meta] of rowMetaRef.current.entries()) {
      const queue = rowQueuesRef.current.get(rowId)
      if (meta.isDirty && !(queue?.hasPending() ?? false)) {
        persistCurrentEdit(rowId)
      }
    }
  }, [persistCurrentEdit])

  const updateEdit = useCallback(
    (
      id: string,
      patch: RowEditPatch,
      updateOptions?: {
        persist?: boolean
        recalcColumnWidths?: boolean
      },
    ) => {
      const startedAt =
        isDev && typeof performance !== "undefined" ? performance.now() : 0
      const shouldPersist = updateOptions?.persist ?? false
      const shouldRecalcColumnWidths =
        updateOptions?.recalcColumnWidths ?? false
      let nextEditToPersist: EditState | null = null
      setEdits((current) => {
        const fallbackRow = rowsByIdRef.current.get(id)
        const base =
          current[id] ?? (fallbackRow ? buildEditState(fallbackRow) : null)
        if (!base) {
          return current
        }
        const nextEdit = { ...base, ...patch }
        if (isSameEditState(base, nextEdit)) {
          return current
        }
        getRowMeta(id).isDirty = true
        if (shouldPersist) {
          nextEditToPersist = nextEdit
        }
        const next = { ...current, [id]: nextEdit }
        if (shouldRecalcColumnWidths) {
          editsRef.current = next
        }
        return next
      })
      if (nextEditToPersist) {
        persistRowEdit(id, nextEditToPersist)
      }
      if (shouldRecalcColumnWidths) {
        scheduleTextColumnWidthRecalc()
      }
      if (isDev && typeof window !== "undefined" && startedAt > 0) {
        requestAnimationFrame(() => {
          recordInputToPaint(Math.max(0, performance.now() - startedAt))
        })
      }
    },
    [
      getRowMeta,
      isDev,
      persistRowEdit,
      recordInputToPaint,
      scheduleTextColumnWidthRecalc,
    ],
  )

  const commitTextEdit = useCallback(
    (id: string, patch: RowEditPatch) => {
      updateEdit(id, patch, {
        persist: true,
        recalcColumnWidths: true,
      })
    },
    [updateEdit],
  )

  const commitEdit = useCallback(
    (id: string, patch: RowEditPatch) => {
      updateEdit(id, patch, {
        persist: true,
      })
    },
    [updateEdit],
  )

  const handleFieldFocus = useCallback(
    (rowId: string) => {
      const meta = getRowMeta(rowId)
      meta.isFocused = true
    },
    [getRowMeta],
  )

  const handleFieldBlur = useCallback(
    (rowId: string) => {
      const meta = getRowMeta(rowId)
      meta.isFocused = false
      markRowCleanIfSettled(rowId)
    },
    [getRowMeta, markRowCleanIfSettled],
  )

  useEffect(() => {
    const liveRowIds = new Set(rows.map((row) => row.id))
    setEdits((current) => {
      let changed = false
      const next: Record<string, EditState> = { ...current }

      for (const row of rows) {
        const serverEdit = buildEditState(row)
        const currentEdit = current[row.id]
        const meta = getRowMeta(row.id)
        const queue = rowQueuesRef.current.get(row.id)
        const hasPending = queue?.hasPending() ?? false
        const protectDraft =
          meta.isDirty &&
          (meta.isFocused || hasPending || meta.hasUnackedChanges)

        if (!currentEdit) {
          next[row.id] = serverEdit
          changed = true
          continue
        }
        if (protectDraft) {
          continue
        }
        if (!isSameEditState(currentEdit, serverEdit)) {
          next[row.id] = serverEdit
          changed = true
        }
      }

      for (const rowId of Object.keys(next)) {
        if (liveRowIds.has(rowId)) {
          continue
        }
        delete next[rowId]
        rowMetaRef.current.delete(rowId)
        rowQueuesRef.current.delete(rowId)
        changed = true
      }

      return changed ? next : current
    })
  }, [getRowMeta, rows])

  return {
    edits,
    commitEdit,
    commitTextEdit,
    discardPendingSave,
    flushPendingEdits,
    handleFieldBlur,
    handleFieldFocus,
    updateEdit,
  }
}
