import { useCallback } from "react"
import type { WorkTreeNode } from "../../state/workspace-tree-state"
import { applyOptimisticCreate } from "../../state/workspace-tree-state"
import { createWorkItem, patchWorkItem } from "../../work-item-client"
import {
  attachCreateLineageOrphaned,
  attachSaveRowDeferredError,
} from "../../work-item-editing/save-result"
import {
  LOCAL_DRAFT_ROW_ID_PREFIX,
  findRow,
  isLocalDraftRowId,
  isObjectLike,
} from "./shared"

type UseWorkspaceDraftFlowOptions = {
  currentWorkspaceId: string | null
  draftSequenceRef: { current: number }
  treeRef: { current: WorkTreeNode[] }
  commitTree: (nextTree: WorkTreeNode[]) => void
  setErrorText: (message: string) => void
  onCreateFocusRow: (rowId: string) => void
}

const CREATE_ONLY_KEYS = new Set(["title", "object", "possiblyRemovable"])

function buildPostCreatePatchPayload(payload: Record<string, unknown>) {
  const patchPayload: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(payload)) {
    if (CREATE_ONLY_KEYS.has(key)) {
      continue
    }
    patchPayload[key] = value
  }
  return patchPayload
}

export async function finalizeCreatedDraftRowImpl(
  created: Record<string, unknown>,
  payload: Record<string, unknown>,
  patchRowById: (
    id: string,
    patchPayload: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>,
) {
  const patchPayload = buildPostCreatePatchPayload(payload)
  if (Object.keys(patchPayload).length === 0) {
    return created
  }

  const createdId = created.id
  if (typeof createdId !== "string" || createdId.length === 0) {
    return created
  }

  try {
    const patched = await patchRowById(createdId, patchPayload)
    return { ...created, ...patched }
  } catch (error) {
    return attachSaveRowDeferredError(created, error)
  }
}

function readPersistedId(value: unknown): string | null {
  if (!isObjectLike(value)) {
    return null
  }
  const id = value.id
  if (typeof id !== "string" || id.length === 0) {
    return null
  }
  return id
}

export async function rollbackCreatedItemIfDraftRemoved(
  draftId: string,
  persisted: unknown,
  treeRef: { current: WorkTreeNode[] },
): Promise<boolean> {
  if (findRow(treeRef.current, draftId)) {
    return false
  }
  const persistedId = readPersistedId(persisted)
  if (!persistedId) {
    return false
  }
  return true
}

export function useWorkspaceDraftFlow(options: UseWorkspaceDraftFlowOptions) {
  const {
    commitTree,
    currentWorkspaceId,
    draftSequenceRef,
    onCreateFocusRow,
    setErrorText,
    treeRef,
  } = options

  const createRowAtPosition = useCallback(
    async (parentId: string | null, targetIndex: number) => {
      if (!currentWorkspaceId) {
        return
      }

      draftSequenceRef.current += 1
      const draftId = `${LOCAL_DRAFT_ROW_ID_PREFIX}${draftSequenceRef.current}`
      commitTree(
        applyOptimisticCreate(
          treeRef.current,
          {
            id: draftId,
            workspaceId: currentWorkspaceId,
            title: "",
            object: null,
            parentId,
            siblingOrder: targetIndex,
            possiblyRemovable: false,
            overcomplication: null,
            importance: null,
            currentProblems: [],
            solutionVariants: [],
          },
          parentId,
          targetIndex,
        ),
      )
      setErrorText("")
      onCreateFocusRow(draftId)
    },
    [
      commitTree,
      currentWorkspaceId,
      draftSequenceRef,
      onCreateFocusRow,
      setErrorText,
      treeRef,
    ],
  )

  const saveRow = useCallback(
    async (id: string, payload: Record<string, unknown>) => {
      if (!isLocalDraftRowId(id)) {
        return patchWorkItem(id, payload)
      }

      const draftRow = findRow(treeRef.current, id)
      if (!draftRow) {
        return null
      }

      const nextTitle =
        typeof payload.title === "string" ? payload.title : draftRow.title
      if (nextTitle.trim().length === 0) {
        return null
      }

      const nextObject = Object.prototype.hasOwnProperty.call(payload, "object")
        ? ((payload.object as string | null) ?? null)
        : draftRow.object
      const nextPossiblyRemovable =
        typeof payload.possiblyRemovable === "boolean"
          ? payload.possiblyRemovable
          : draftRow.possiblyRemovable

      const created = await createWorkItem({
        workspaceId: draftRow.workspaceId,
        title: nextTitle,
        object: nextObject,
        parentId: draftRow.parentId,
        siblingOrder: draftRow.siblingOrder,
        possiblyRemovable: nextPossiblyRemovable,
      })

      if (!isObjectLike(created)) {
        return created
      }

      const finalized = await finalizeCreatedDraftRowImpl(
        created,
        payload,
        patchWorkItem,
      )

      const orphaned = await rollbackCreatedItemIfDraftRemoved(
        id,
        finalized,
        treeRef,
      )
      if (orphaned && isObjectLike(finalized)) {
        return attachCreateLineageOrphaned(finalized)
      }
      return finalized
    },
    [treeRef],
  )

  return {
    createRowAtPosition,
    saveRow,
  }
}
