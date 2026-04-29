"use client"

import { type RatingFieldKey, ratingFieldKeys } from "@ood/domain"
import { useCallback, useEffect, useRef, useState } from "react"
import { buildEditState, isSameEditState } from "./edit-state"
import {
  buildRowPatchFromServer,
  shouldApplyConfirmedTreePatch,
} from "./reconciliation"
import { buildPatchPayload } from "./save-payload"
import { LocalFirstRowQueue, type RevisionedValue } from "./save-queue"
import {
  isCreateLineageOrphaned,
  readSaveRowDeferredError,
} from "./save-result"
import type {
  EditState,
  EditableWorkItemPatch,
  EditableWorkItemRow,
  RowEditMeta,
  RowEditPatch,
  WorkspaceMetricValue,
} from "./types"

type UseWorkItemEditingOptions<Row extends EditableWorkItemRow> = {
  isDev: boolean
  onPersistedChange?: (
    change:
      | { kind: "patch"; before: Row; after: Row }
      | { kind: "create"; before: Row; after: Row },
  ) => void
  rows: Row[]
  rowsById: Map<string, Row>
  patchRow: (rowId: string, patch: EditableWorkItemPatch) => void
  reportError: (message: string) => void
  saveRow: (id: string, payload: Record<string, unknown>) => Promise<unknown>
  toErrorText: (error: unknown) => string
  recordInputToPaint: (durationMs: number) => void
  recordPatchLatency?: (durationMs: number) => void
  scheduleTextColumnWidthRecalc: () => void
  onRefreshProtectionChange?: (hasProtectedRows: boolean) => void
}

export function resolveLogicalRowId(
  logicalRowIds: ReadonlyMap<string, string>,
  rowId: string,
): string {
  let current = rowId
  const seen = new Set<string>()
  while (true) {
    const mapped = logicalRowIds.get(current)
    if (!mapped || mapped === current || seen.has(current)) {
      return current
    }
    seen.add(current)
    current = mapped
  }
}

export function buildOptimisticRatingPatch<Row extends EditableWorkItemRow>(
  row: Row | undefined,
  patch: RowEditPatch,
): EditableWorkItemPatch | null {
  if (!row || row.children.length > 0) {
    return null
  }

  const optimisticPatch: EditableWorkItemPatch = {}
  for (const field of ratingFieldKeys as readonly RatingFieldKey[]) {
    if (!(field in patch)) {
      continue
    }
    const nextValue = toNullableRating(patch[field])
    if (nextValue !== row[field]) {
      optimisticPatch[field] = nextValue
    }
  }

  return Object.keys(optimisticPatch).length > 0 ? optimisticPatch : null
}

export function buildOptimisticMetricPatch<Row extends EditableWorkItemRow>(
  row: Row | undefined,
  patch: RowEditPatch,
): EditableWorkItemPatch | null {
  if (!row || row.children.length > 0 || !patch.metricValues) {
    return null
  }

  let hasChange = false
  const currentMetricValues = row.metricValues ?? {}
  const nextMetricValues: Record<string, WorkspaceMetricValue> = {
    ...currentMetricValues,
  }
  for (const [metricId, value] of Object.entries(patch.metricValues)) {
    const currentValue = currentMetricValues[metricId] ?? "none"
    if (currentValue === value) {
      continue
    }
    hasChange = true
    if (value === "none") {
      delete nextMetricValues[metricId]
      continue
    }
    nextMetricValues[metricId] = value
  }

  if (!hasChange) {
    return null
  }

  return {
    metricValues: nextMetricValues,
  }
}

function toNullableRating(value: string | undefined): number | null {
  if (!value || value.trim().length === 0) {
    return null
  }

  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return null
  }

  return Math.max(0, Math.min(5, Math.trunc(parsed)))
}

export function useWorkItemEditing<Row extends EditableWorkItemRow>(
  options: UseWorkItemEditingOptions<Row>,
) {
  const {
    isDev,
    onPersistedChange,
    rows,
    rowsById,
    patchRow,
    reportError,
    saveRow,
    toErrorText,
    recordInputToPaint,
    recordPatchLatency,
    scheduleTextColumnWidthRecalc,
    onRefreshProtectionChange,
  } = options
  const [edits, setEdits] = useState<Record<string, EditState>>({})
  const rowQueuesRef = useRef<Map<string, LocalFirstRowQueue<EditState>>>(
    new Map(),
  )
  const rowMetaRef = useRef<Map<string, RowEditMeta>>(new Map())
  const logicalRowIdsRef = useRef<Map<string, string>>(new Map())
  const editsRef = useRef<Record<string, EditState>>({})
  const rowsByIdRef = useRef(rowsById)
  rowsByIdRef.current = rowsById

  useEffect(() => {
    editsRef.current = edits
  }, [edits])

  const resolveLogicalRowIdRef = useCallback(
    (rowId: string) => resolveLogicalRowId(logicalRowIdsRef.current, rowId),
    [],
  )

  const getRowQueue = useCallback(
    (rowId: string) => {
      const logicalRowId = resolveLogicalRowIdRef(rowId)
      const existing = rowQueuesRef.current.get(logicalRowId)
      if (existing) {
        return existing
      }
      const created = new LocalFirstRowQueue<EditState>()
      rowQueuesRef.current.set(logicalRowId, created)
      return created
    },
    [resolveLogicalRowIdRef],
  )

  const getRowMeta = useCallback(
    (rowId: string) => {
      const logicalRowId = resolveLogicalRowIdRef(rowId)
      const existing = rowMetaRef.current.get(logicalRowId)
      if (existing) {
        return existing
      }
      const created: RowEditMeta = {
        isDirty: false,
        isFocused: false,
        hasUnackedChanges: false,
      }
      rowMetaRef.current.set(logicalRowId, created)
      return created
    },
    [resolveLogicalRowIdRef],
  )

  const discardPendingSave = useCallback(
    (id: string) => {
      const queue = rowQueuesRef.current.get(resolveLogicalRowIdRef(id))
      queue?.clearQueued()
    },
    [resolveLogicalRowIdRef],
  )

  const resetEdit = useCallback(
    (id: string) => {
      const currentRow = rowsByIdRef.current.get(id)
      if (!currentRow) {
        return
      }

      rowQueuesRef.current.get(resolveLogicalRowIdRef(id))?.clearQueued()
      const meta = getRowMeta(id)
      meta.isDirty = false
      meta.hasUnackedChanges = false

      setEdits((current) => {
        const nextEdit = buildEditState(currentRow)
        const currentEdit = current[id]
        if (currentEdit && isSameEditState(currentEdit, nextEdit)) {
          return current
        }
        return { ...current, [id]: nextEdit }
      })
    },
    [getRowMeta, resolveLogicalRowIdRef],
  )

  const remapRowState = useCallback(
    (fromRowId: string, toRowId: string) => {
      if (fromRowId === toRowId) {
        return
      }

      const logicalFrom = resolveLogicalRowIdRef(fromRowId)
      const logicalTo = resolveLogicalRowIdRef(toRowId)
      logicalRowIdsRef.current.set(fromRowId, logicalTo)
      logicalRowIdsRef.current.set(logicalFrom, logicalTo)
      logicalRowIdsRef.current.set(toRowId, logicalTo)

      const queue = rowQueuesRef.current.get(logicalFrom)
      if (queue) {
        rowQueuesRef.current.delete(logicalFrom)
        rowQueuesRef.current.set(logicalTo, queue)
      }

      const meta = rowMetaRef.current.get(logicalFrom)
      if (meta) {
        rowMetaRef.current.delete(logicalFrom)
        rowMetaRef.current.set(logicalTo, meta)
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
    },
    [resolveLogicalRowIdRef],
  )

  const markRowCleanIfSettled = useCallback(
    (id: string) => {
      const queue = rowQueuesRef.current.get(resolveLogicalRowIdRef(id))
      const meta = getRowMeta(id)
      const hasPending = queue?.hasPending() ?? false
      if (!hasPending && !meta.isFocused && !meta.hasUnackedChanges) {
        meta.isDirty = false
      }
    },
    [getRowMeta, resolveLogicalRowIdRef],
  )

  const notifyRefreshProtection = useCallback(() => {
    if (!onRefreshProtectionChange) {
      return
    }
    for (const [rowId, meta] of rowMetaRef.current.entries()) {
      const queue = rowQueuesRef.current.get(rowId)
      const hasPending = queue?.hasPending() ?? false
      if (
        hasPending ||
        meta.isDirty ||
        meta.isFocused ||
        meta.hasUnackedChanges
      ) {
        onRefreshProtectionChange(true)
        return
      }
    }
    onRefreshProtectionChange(false)
  }, [onRefreshProtectionChange])

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
        notifyRefreshProtection()
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
        notifyRefreshProtection()
        return
      }

      const startedAt =
        isDev && typeof performance !== "undefined" ? performance.now() : 0

      try {
        const saveResult = await saveRow(activeRowId, payload)
        const deferredSaveError = readSaveRowDeferredError(saveResult)
        const createLineageOrphaned = isCreateLineageOrphaned(saveResult)
        const updated =
          saveResult && typeof saveResult === "object"
            ? (saveResult as Partial<Row>)
            : null
        const updatedId =
          updated && typeof updated === "object" && "id" in updated
            ? updated.id
            : undefined
        const nextRowId =
          !createLineageOrphaned &&
          typeof updatedId === "string" &&
          updatedId.length > 0
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

        const nextRowSnapshot = buildNextRowSnapshot(
          currentRow,
          updated,
          nextRowId,
        )
        applyServerAckPatch({
          ackShouldApply:
            !createLineageOrphaned && !ackResult.stale && ackResult.shouldApply,
          activeRowId,
          nextRowId,
          patchRow,
          payload,
          updated,
        })

        if (nextRowId !== activeRowId) {
          remapRowState(activeRowId, nextRowId)
          activeRowId = nextRowId
        }

        if (
          !createLineageOrphaned &&
          !ackResult.stale &&
          ackResult.shouldApply &&
          updated &&
          onPersistedChange
        ) {
          onPersistedChange({
            kind: activeRowId === id ? "patch" : "create",
            before: currentRow,
            after: nextRowSnapshot,
          })
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
        notifyRefreshProtection()
      } catch (error) {
        const nextRequest = queue.fail(request.revision)
        if (!nextRequest) {
          patchRow(activeRowId, buildRowPatchFromServer(currentRow))
        }
        if (nextRequest) {
          void runRowSaveRequest(activeRowId, nextRequest, currentRow)
        }
        reportError(toErrorText(error))
        notifyRefreshProtection()
      }
    },
    [
      getRowMeta,
      getRowQueue,
      isDev,
      markRowCleanIfSettled,
      patchRow,
      onPersistedChange,
      reportError,
      recordPatchLatency,
      remapRowState,
      saveRow,
      toErrorText,
      notifyRefreshProtection,
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
      notifyRefreshProtection()
    },
    [getRowMeta, getRowQueue, notifyRefreshProtection, startQueuedSave],
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

  const flushPendingEdits = useCallback(async () => {
    const barrierQueues = new Set<LocalFirstRowQueue<EditState>>()

    for (const queue of rowQueuesRef.current.values()) {
      if (queue.hasPending()) {
        barrierQueues.add(queue)
      }
    }

    for (const [rowId, meta] of rowMetaRef.current.entries()) {
      const queue = rowQueuesRef.current.get(rowId)
      if (meta.isDirty && !(queue?.hasPending() ?? false)) {
        persistCurrentEdit(rowId)
        barrierQueues.add(getRowQueue(rowId))
      }
    }

    if (barrierQueues.size === 0) {
      return
    }

    await Promise.all(
      Array.from(barrierQueues, (queue) => queue.waitUntilIdle()),
    )

    for (const [rowId, meta] of rowMetaRef.current.entries()) {
      if (!barrierQueues.has(getRowQueue(rowId))) {
        continue
      }
      if (!meta.hasUnackedChanges) {
        continue
      }
      throw new Error(
        "Не удалось сохранить все изменения. Проверьте сеть и попробуйте снова.",
      )
    }
  }, [getRowQueue, persistCurrentEdit])

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
      const optimisticRatingPatch = buildOptimisticRatingPatch(
        rowsByIdRef.current.get(id),
        patch,
      )
      const optimisticMetricPatch = buildOptimisticMetricPatch(
        rowsByIdRef.current.get(id),
        patch,
      )
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
      if (optimisticRatingPatch) {
        patchRow(id, optimisticRatingPatch)
      }
      if (optimisticMetricPatch) {
        patchRow(id, optimisticMetricPatch)
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
      patchRow,
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
      notifyRefreshProtection()
    },
    [getRowMeta, notifyRefreshProtection],
  )

  const handleFieldBlur = useCallback(
    (rowId: string) => {
      const meta = getRowMeta(rowId)
      meta.isFocused = false
      markRowCleanIfSettled(rowId)
      notifyRefreshProtection()
    },
    [getRowMeta, markRowCleanIfSettled, notifyRefreshProtection],
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
        const queue = getRowQueue(row.id)
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
        cleanupDetachedRowState(
          rowId,
          rowMetaRef.current,
          rowQueuesRef.current,
          logicalRowIdsRef.current,
        )
        changed = true
      }

      return changed ? next : current
    })
  }, [getRowMeta, getRowQueue, rows])

  useEffect(() => {
    notifyRefreshProtection()
  }, [notifyRefreshProtection])

  return {
    edits,
    commitEdit,
    commitTextEdit,
    discardPendingSave,
    resetEdit,
    flushPendingEdits,
    handleFieldBlur,
    handleFieldFocus,
    updateEdit,
  }
}

export function buildNextRowSnapshot<Row extends EditableWorkItemRow>(
  currentRow: Row,
  updated: Partial<Row> | null,
  nextRowId: string,
): Row {
  return {
    ...currentRow,
    ...(updated ?? {}),
    id: nextRowId,
  } as Row
}

type ApplyServerAckPatchOptions<Row extends EditableWorkItemRow> = {
  ackShouldApply: boolean
  activeRowId: string
  nextRowId: string
  patchRow: (rowId: string, patch: EditableWorkItemPatch) => void
  payload: Record<string, unknown>
  updated: Partial<Row> | null
}

export function applyServerAckPatch<Row extends EditableWorkItemRow>(
  options: ApplyServerAckPatchOptions<Row>,
) {
  const { ackShouldApply, activeRowId, nextRowId, patchRow, payload, updated } =
    options

  if (nextRowId !== activeRowId) {
    patchRow(activeRowId, { id: nextRowId })
  }

  if (!ackShouldApply || !updated) {
    return
  }

  const patch = buildRowPatchFromServer(updated)
  if (!shouldApplyConfirmedTreePatch(patch, payload)) {
    return
  }
  patchRow(nextRowId, patch)
}

export function cleanupDetachedRowState(
  rowId: string,
  rowMeta: Map<string, RowEditMeta>,
  rowQueues: Map<string, LocalFirstRowQueue<EditState>>,
  logicalRowIds: Map<string, string>,
) {
  rowMeta.delete(rowId)
  rowQueues.delete(rowId)
  logicalRowIds.delete(rowId)
}
