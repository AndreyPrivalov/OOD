"use client"

import { useCallback, useEffect, useRef, useState } from "react"
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
  patchWorkItem,
} from "../work-item-client"

type UseWorkspaceTreeDataOptions = {
  currentWorkspaceId: string | null
  discardPendingSave: (id: string) => void
  isDev: boolean
  onCreateFocusRow: (rowId: string) => void
  onDeleteRow: (rowId: string) => void
}

const LOCAL_DRAFT_ROW_ID_PREFIX = "local-draft:"

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object"
}

function isLocalDraftRowId(id: string) {
  return id.startsWith(LOCAL_DRAFT_ROW_ID_PREFIX)
}

function removeLocalRow(nodes: WorkTreeNode[], rowId: string): WorkTreeNode[] {
  const nextNodes: WorkTreeNode[] = []
  let changed = false

  for (const node of nodes) {
    if (node.id === rowId) {
      changed = true
      continue
    }
    const nextChildren = removeLocalRow(node.children, rowId)
    if (nextChildren !== node.children) {
      changed = true
      nextNodes.push({ ...node, children: nextChildren })
      continue
    }
    nextNodes.push(node)
  }

  if (!changed) {
    return nodes
  }

  return nextNodes.map((node, index) => ({ ...node, siblingOrder: index }))
}

function findRow(nodes: WorkTreeNode[], rowId: string): WorkTreeNode | null {
  const queue = [...nodes]
  while (queue.length > 0) {
    const node = queue.shift()
    if (!node) {
      continue
    }
    if (node.id === rowId) {
      return node
    }
    queue.push(...node.children)
  }
  return null
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
  const draftSequenceRef = useRef(0)
  const treeRef = useRef(tree)

  useEffect(() => {
    treeRef.current = tree
  }, [tree])

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

      draftSequenceRef.current += 1
      const draftId = `${LOCAL_DRAFT_ROW_ID_PREFIX}${draftSequenceRef.current}`
      setTree((current) =>
        applyOptimisticCreate(
          current,
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
            blocksMoney: null,
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
    [currentWorkspaceId, onCreateFocusRow],
  )

  const deleteRow = useCallback(
    async (id: string) => {
      if (isLocalDraftRowId(id)) {
        discardPendingSave(id)
        setTree((current) => removeLocalRow(current, id))
        onDeleteRow(id)
        return
      }
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

      const createOnlyKeys = new Set(["title", "object", "possiblyRemovable"])
      const patchPayload: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(payload)) {
        if (createOnlyKeys.has(key)) {
          continue
        }
        patchPayload[key] = value
      }

      if (Object.keys(patchPayload).length === 0) {
        return created
      }
      if (!isObjectLike(created) || typeof created.id !== "string") {
        return created
      }
      const patched = await patchWorkItem(created.id, patchPayload)
      return { ...created, ...patched }
    },
    [],
  )

  const moveRow = useCallback(
    async (id: string, targetParentId: string | null, targetIndex: number) => {
      if (isLocalDraftRowId(id)) {
        setTree((current) =>
          applyOptimisticMove(current, id, targetParentId, targetIndex),
        )
        return
      }
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
    saveRow,
    moveRow,
    toErrorText,
    refreshCount,
  }
}
