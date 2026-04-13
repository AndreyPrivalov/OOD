"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  LocalFirstRowQueue,
  type RevisionedValue,
  type RowEditPatch,
} from "./local-first-autosave"
import {
  type WorkspaceRatingEditValues,
  type WorkspaceRatingValues,
  areRatingEditValuesEqual,
  buildRatingEditValues,
  buildRatingPayload,
  buildRatingServerPatch,
} from "./workspace-ratings"

export type EditableWorkItemRow = {
  id: string
  title: string
  object: string | null
  possiblyRemovable: boolean
  overcomplication: number | null
  importance: number | null
  blocksMoney: number | null
  currentProblems: string[]
  solutionVariants: string[]
  children: Array<{ id: string }>
}

export type EditableWorkItemPatch = Partial<
  Omit<EditableWorkItemRow, "children">
>

export type EditState = {
  title: string
  object: string
  possiblyRemovable: boolean
  currentProblems: string
  solutionVariants: string
} & WorkspaceRatingEditValues

type RowEditMeta = {
  isDirty: boolean
  isFocused: boolean
  lastLocalRevision: number
  lastAckRevision: number
}

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

function listToMultiline(values: string[]) {
  return values.join("\n")
}

function multilineToList(value: string) {
  return value
    .split("\n")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
}

function isSameStringList(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false
  }
  return left.every((value, index) => value === right[index])
}

export function buildEditState(row: EditableWorkItemRow): EditState {
  return {
    title: row.title,
    object: row.object ?? "",
    possiblyRemovable: row.possiblyRemovable ?? false,
    ...buildRatingEditValues(row),
    currentProblems: listToMultiline(row.currentProblems),
    solutionVariants: listToMultiline(row.solutionVariants),
  }
}

export function isSameEditState(left: EditState, right: EditState): boolean {
  return (
    left.title === right.title &&
    left.object === right.object &&
    left.possiblyRemovable === right.possiblyRemovable &&
    areRatingEditValuesEqual(left, right) &&
    left.currentProblems === right.currentProblems &&
    left.solutionVariants === right.solutionVariants
  )
}

export function buildRowPatchFromServer(
  updated: Partial<EditableWorkItemRow>,
): EditableWorkItemPatch {
  const patch: EditableWorkItemPatch = {}
  if (typeof updated.title === "string") {
    patch.title = updated.title
  }
  if (updated.object === null || typeof updated.object === "string") {
    patch.object = updated.object
  }
  if (typeof updated.possiblyRemovable === "boolean") {
    patch.possiblyRemovable = updated.possiblyRemovable
  }
  Object.assign(
    patch,
    buildRatingServerPatch(updated as Partial<WorkspaceRatingValues>),
  )
  if (Array.isArray(updated.currentProblems)) {
    patch.currentProblems = updated.currentProblems.filter(
      (item): item is string => typeof item === "string",
    )
  }
  if (Array.isArray(updated.solutionVariants)) {
    patch.solutionVariants = updated.solutionVariants.filter(
      (item): item is string => typeof item === "string",
    )
  }
  return patch
}

function isSamePrimitiveOrList(left: unknown, right: unknown): boolean {
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) {
      return false
    }
    return left.every((item, index) => item === right[index])
  }
  return left === right
}

function isServerPatchEchoingPayload(
  patch: EditableWorkItemPatch,
  payload: Record<string, unknown>,
): boolean {
  const entries = Object.entries(patch)
  if (entries.length === 0) {
    return false
  }
  return entries.every(([key, value]) =>
    isSamePrimitiveOrList(value, payload[key]),
  )
}

function buildPatchPayload(
  currentRow: EditableWorkItemRow,
  rowEdit: EditState,
) {
  const payload: Record<string, unknown> = {}
  const nextTitle = rowEdit.title
  if (nextTitle !== currentRow.title) {
    payload.title = nextTitle
  }

  const nextObject = rowEdit.object.trim().length === 0 ? null : rowEdit.object
  if (nextObject !== currentRow.object) {
    payload.object = nextObject
  }

  if (rowEdit.possiblyRemovable !== currentRow.possiblyRemovable) {
    payload.possiblyRemovable = rowEdit.possiblyRemovable
  }

  const isParentRow = currentRow.children.length > 0
  if (!isParentRow) {
    Object.assign(payload, buildRatingPayload(currentRow, rowEdit))
  }

  const nextCurrentProblems = multilineToList(rowEdit.currentProblems)
  if (!isSameStringList(nextCurrentProblems, currentRow.currentProblems)) {
    payload.currentProblems = nextCurrentProblems
  }

  const nextSolutionVariants = multilineToList(rowEdit.solutionVariants)
  if (!isSameStringList(nextSolutionVariants, currentRow.solutionVariants)) {
    payload.solutionVariants = nextSolutionVariants
  }

  return payload
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
