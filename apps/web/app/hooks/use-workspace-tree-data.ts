"use client"

import { useCallback, useEffect, useState } from "react"
import {
  type WorkTreeNode,
  applyOptimisticCreate,
  applyOptimisticMove,
  mapWorkItemErrorText,
  normalizeTreeData,
} from "../state/workspace-tree-state"
import {
  WorkItemRequestError,
  createWorkItem,
  deleteWorkItem,
  fetchWorkItems,
  moveWorkItem,
} from "../work-item-client"

type UseWorkspaceTreeDataOptions = {
  currentWorkspaceId: string | null
  discardPendingSave: (id: string) => void
  isDev: boolean
  onCreateFocusRow: (rowId: string) => void
  onDeleteRow: (rowId: string) => void
}

export function useWorkspaceTreeData(options: UseWorkspaceTreeDataOptions) {
  const {
    currentWorkspaceId,
    discardPendingSave,
    isDev,
    onCreateFocusRow,
    onDeleteRow,
  } = options
  const [tree, setTree] = useState<WorkTreeNode[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorText, setErrorText] = useState("")
  const [refreshCount, setRefreshCount] = useState(0)

  const toErrorText = useCallback((error: unknown) => {
    if (error instanceof WorkItemRequestError) {
      return mapWorkItemErrorText(error.payload)
    }
    return error instanceof Error ? error.message : "Неизвестная ошибка."
  }, [])

  const refreshTree = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!currentWorkspaceId) {
        setTree([])
        setIsLoading(false)
        return
      }
      if (!opts?.silent) {
        setIsLoading(true)
      }
      try {
        const data = await fetchWorkItems(currentWorkspaceId)
        setTree(normalizeTreeData(data))
        if (isDev) {
          setRefreshCount((current) => current + 1)
        }
        setErrorText("")
      } catch (error) {
        setErrorText(toErrorText(error))
      } finally {
        if (!opts?.silent) {
          setIsLoading(false)
        }
      }
    },
    [currentWorkspaceId, isDev, toErrorText],
  )

  useEffect(() => {
    void refreshTree()
  }, [refreshTree])

  const createRowAtPosition = useCallback(
    async (parentId: string | null, targetIndex: number) => {
      if (!currentWorkspaceId) {
        return
      }

      try {
        const created = await createWorkItem({
          workspaceId: currentWorkspaceId,
          title: "",
          object: null,
          parentId,
          siblingOrder: targetIndex,
        })
        const createdId =
          created && typeof created === "object" && "id" in created
            ? created.id
            : null
        if (created && typeof created === "object") {
          setTree((current) =>
            applyOptimisticCreate(
              current,
              created as Partial<WorkTreeNode>,
              parentId,
              targetIndex,
            ),
          )
        }
        if (typeof createdId === "string" && createdId.length > 0) {
          onCreateFocusRow(createdId)
        }
        await refreshTree({ silent: true })
      } catch (error) {
        setErrorText(toErrorText(error))
      }
    },
    [currentWorkspaceId, onCreateFocusRow, refreshTree, toErrorText],
  )

  const deleteRow = useCallback(
    async (id: string) => {
      try {
        discardPendingSave(id)
        await deleteWorkItem(id)
        onDeleteRow(id)
        await refreshTree()
      } catch (error) {
        setErrorText(toErrorText(error))
      }
    },
    [discardPendingSave, onDeleteRow, refreshTree, toErrorText],
  )

  const moveRow = useCallback(
    async (id: string, targetParentId: string | null, targetIndex: number) => {
      try {
        setTree((current) =>
          applyOptimisticMove(current, id, targetParentId, targetIndex),
        )
        await moveWorkItem(id, {
          targetParentId,
          targetIndex,
        })
        await refreshTree({ silent: true })
        setErrorText("")
      } catch (error) {
        setErrorText(toErrorText(error))
      }
    },
    [refreshTree, toErrorText],
  )

  return {
    tree,
    setTree,
    isLoading,
    errorText,
    setErrorText,
    refreshTree,
    createRowAtPosition,
    deleteRow,
    moveRow,
    toErrorText,
    refreshCount,
  }
}
