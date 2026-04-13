"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  type EditState,
  type EditableWorkItemPatch,
  type EditableWorkItemRow,
  LocalFirstRowQueue,
  type RevisionedValue,
  type RowEditMeta,
  type RowEditPatch,
  buildEditState,
  buildPatchPayload,
  buildRowPatchFromServer,
  isSameEditState,
  isServerPatchEchoingPayload,
} from "./work-item-editing"

export type { EditState, EditableWorkItemPatch, EditableWorkItemRow }
export { buildEditState }

type UseWorkItemEditingOptions<Row extends EditableWorkItemRow> = {
  isDev: boolean
  rows: Row[]
  rowsById: Map<string, Row>
  patchRow: (rowId: string, patch: EditableWorkItemPatch) => void
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
      lastLocalRevision: 0,
      lastAckRevision: 0,
    }
    rowMetaRef.current.set(rowId, created)
    return created
  }, [])

  const discardPendingSave = useCallback((id: string) => {
    const queue = rowQueuesRef.current.get(id)
    queue?.clearQueued()
  }, [])

  const markRowCleanIfSettled = useCallback(
    (id: string) => {
      const queue = rowQueuesRef.current.get(id)
      const meta = getRowMeta(id)
      const hasPending = queue?.hasPending() ?? false
      if (
        !hasPending &&
        meta.lastAckRevision >= meta.lastLocalRevision &&
        !meta.isFocused
      ) {
        meta.isDirty = false
      }
    },
    [getRowMeta],
  )

  const runRowSaveRequest = useCallback(
    async (id: string, request: RevisionedValue<EditState>) => {
      const queue = getRowQueue(id)
      const currentRow = rowsById.get(id)
      if (!currentRow) {
        queue.acknowledge(request.revision)
        markRowCleanIfSettled(id)
        return
      }

      const payload = buildPatchPayload(currentRow, request.value)
      if (Object.keys(payload).length === 0) {
        const ackResult = queue.acknowledge(request.revision)
        const meta = getRowMeta(id)
        meta.lastAckRevision = Math.max(
          meta.lastAckRevision,
          queue.getLastAckRevision(),
        )
        if (ackResult.nextRequest) {
          void runRowSaveRequest(id, ackResult.nextRequest)
        }
        markRowCleanIfSettled(id)
        return
      }

      const startedAt =
        isDev && typeof performance !== "undefined" ? performance.now() : 0

      try {
        const updated = (await saveRow(id, payload)) as Partial<Row>

        if (isDev && typeof performance !== "undefined") {
          const latency = Math.max(0, performance.now() - startedAt)
          recordPatchLatency?.(latency)
        }

        const ackResult = queue.acknowledge(request.revision)
        const meta = getRowMeta(id)
        meta.lastAckRevision = Math.max(
          meta.lastAckRevision,
          queue.getLastAckRevision(),
        )

        if (!ackResult.stale && ackResult.shouldApply && updated) {
          const patch = buildRowPatchFromServer(updated)
          if (
            Object.keys(patch).length > 0 &&
            !isServerPatchEchoingPayload(patch, payload)
          ) {
            patchRow(id, patch)
          }
        }
        if (ackResult.nextRequest) {
          void runRowSaveRequest(id, ackResult.nextRequest)
        }
        reportError("")
        markRowCleanIfSettled(id)
      } catch (error) {
        const nextRequest = queue.fail(request.revision)
        if (nextRequest) {
          void runRowSaveRequest(id, nextRequest)
        }
        reportError(toErrorText(error))
      }
    },
    [
      getRowMeta,
      getRowQueue,
      isDev,
      markRowCleanIfSettled,
      patchRow,
      reportError,
      recordPatchLatency,
      rowsById,
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
      const revisioned = queue.enqueue(nextEdit)
      const meta = getRowMeta(id)
      meta.isDirty = true
      meta.lastLocalRevision = Math.max(
        meta.lastLocalRevision,
        revisioned.revision,
      )
      startQueuedSave(id)
    },
    [getRowMeta, getRowQueue, startQueuedSave],
  )

  const persistCurrentEdit = useCallback(
    (id: string) => {
      const currentRow = rowsById.get(id)
      if (!currentRow) {
        return
      }
      const nextEdit = editsRef.current[id] ?? buildEditState(currentRow)
      persistRowEdit(id, nextEdit)
    },
    [persistRowEdit, rowsById],
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
        const fallbackRow = rowsById.get(id)
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
      rowsById,
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
        const protectDraft = meta.isDirty && (meta.isFocused || hasPending)

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
