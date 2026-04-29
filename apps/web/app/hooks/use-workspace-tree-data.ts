"use client"

import {
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react"
import {
  type HistoryEntry,
  type WorkspaceHistoryState,
  areTreesEquivalent,
  clearWorkspaceHistory,
  findBranch,
  getRowPlacement,
  loadWorkspaceHistory,
  makeEmptyHistory,
  recordHistoryEntry,
  saveWorkspaceHistory,
} from "../history/workspace-history"
import {
  type WorkTreeNode,
  applyOptimisticMove,
  mapWorkItemErrorText,
  normalizeTreeData,
} from "../state/workspace-tree-state"
import {
  WorkItemRequestError,
  deleteWorkItem,
  fetchWorkItems,
  moveWorkItem,
} from "../work-item-client"
import { WorkspaceMetricRequestError } from "../workspace-metric-client"
import type { WorkspaceMetricSummary } from "../workspaces/types"
import { mapSettingsErrorMessage } from "../workspaces/workspace-settings"
import {
  finalizeCreatedDraftRowImpl,
  useWorkspaceDraftFlow,
} from "./workspace-tree-data/draft-flow"
import { useWorkspaceHistoryActions } from "./workspace-tree-data/history-actions"
import { useWorkspaceMetricCatalogActions } from "./workspace-tree-data/metric-catalog-actions"
import { isLocalDraftRowId, removeLocalRow } from "./workspace-tree-data/shared"

type UseWorkspaceTreeDataOptions = {
  currentWorkspaceId: string | null
  discardPendingSave: (id: string) => void
  isDev: boolean
  onWorkspaceMetricsChange: (
    workspaceId: string,
    metrics: WorkspaceMetricSummary[],
  ) => void
  onCreateFocusRow: (rowId: string) => void
  onDeleteRow: (rowId: string) => void
  workspaceMetrics: WorkspaceMetricSummary[]
  isRefreshProtected?: () => boolean
}

export function shouldDeferWorkspaceRefresh(
  isRefreshProtected: (() => boolean) | undefined,
) {
  return isRefreshProtected?.() ?? false
}

export async function finalizeCreatedDraftRow(
  created: Record<string, unknown>,
  payload: Record<string, unknown>,
  patchRowById: (
    id: string,
    patchPayload: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>,
) {
  return finalizeCreatedDraftRowImpl(created, payload, patchRowById)
}

export function useWorkspaceTreeData(options: UseWorkspaceTreeDataOptions) {
  const {
    currentWorkspaceId,
    discardPendingSave,
    isDev,
    onWorkspaceMetricsChange,
    onCreateFocusRow,
    onDeleteRow,
    workspaceMetrics,
    isRefreshProtected,
  } = options
  const [tree, setTree] = useState<WorkTreeNode[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorText, setErrorText] = useState("")
  const [refreshCount, setRefreshCount] = useState(0)
  const [historyState, setHistoryState] =
    useState<WorkspaceHistoryState | null>(null)
  const [isApplyingHistory, setIsApplyingHistory] = useState(false)
  const draftSequenceRef = useRef(0)
  const treeRef = useRef(tree)
  const historyRef = useRef<WorkspaceHistoryState | null>(historyState)
  const workspaceMetricsRef = useRef(workspaceMetrics)
  const hasDeferredRefreshRef = useRef(false)

  useEffect(() => {
    treeRef.current = tree
  }, [tree])

  useEffect(() => {
    historyRef.current = historyState
  }, [historyState])

  useEffect(() => {
    workspaceMetricsRef.current = workspaceMetrics
  }, [workspaceMetrics])

  const toErrorText = useCallback((error: unknown) => {
    if (error instanceof WorkItemRequestError) {
      return mapWorkItemErrorText(error.payload)
    }
    if (error instanceof WorkspaceMetricRequestError) {
      return mapSettingsErrorMessage(
        error.payload,
        "Не удалось выполнить действие с метрикой.",
      )
    }
    return error instanceof Error ? error.message : "Неизвестная ошибка."
  }, [])

  const commitTree = useCallback((nextTree: WorkTreeNode[]) => {
    treeRef.current = nextTree
    setTree(nextTree)
  }, [])

  const updateTree = useCallback(
    (nextTree: SetStateAction<WorkTreeNode[]>) => {
      const resolved =
        typeof nextTree === "function" ? nextTree(treeRef.current) : nextTree
      commitTree(resolved)
    },
    [commitTree],
  )

  const commitHistory = useCallback(
    (nextHistory: WorkspaceHistoryState | null) => {
      historyRef.current = nextHistory
      setHistoryState(nextHistory)
      if (!currentWorkspaceId) {
        return
      }
      if (!nextHistory) {
        clearWorkspaceHistory(currentWorkspaceId)
        return
      }
      saveWorkspaceHistory(currentWorkspaceId, nextHistory)
    },
    [currentWorkspaceId],
  )

  const pushHistoryEntry = useCallback(
    (entry: HistoryEntry, nextPresent: WorkTreeNode[]) => {
      const base = historyRef.current ?? makeEmptyHistory(treeRef.current)
      commitHistory(recordHistoryEntry(base, entry, nextPresent))
    },
    [commitHistory],
  )

  const refreshTree = useCallback(
    async (opts?: { silent?: boolean; reconcileHistory?: boolean }) => {
      if (!currentWorkspaceId) {
        commitTree([])
        commitHistory(null)
        setIsLoading(false)
        return
      }

      if (!opts?.silent) {
        setIsLoading(true)
      }

      try {
        const data = normalizeTreeData(await fetchWorkItems(currentWorkspaceId))
        if (shouldDeferWorkspaceRefresh(isRefreshProtected)) {
          hasDeferredRefreshRef.current = true
          return
        }
        const existingHistory = historyRef.current

        if (opts?.reconcileHistory && existingHistory) {
          if (areTreesEquivalent(data, existingHistory.present)) {
            commitTree(data)
            commitHistory({ ...existingHistory, present: data })
          } else {
            commitTree(data)
            commitHistory(makeEmptyHistory(data))
          }
        } else {
          commitTree(data)
          commitHistory(makeEmptyHistory(data))
        }

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
    [
      commitHistory,
      commitTree,
      currentWorkspaceId,
      isDev,
      isRefreshProtected,
      toErrorText,
    ],
  )

  const flushDeferredRefresh = useCallback(() => {
    if (
      !hasDeferredRefreshRef.current ||
      shouldDeferWorkspaceRefresh(isRefreshProtected)
    ) {
      return
    }
    hasDeferredRefreshRef.current = false
    void refreshTree({ silent: true, reconcileHistory: true })
  }, [isRefreshProtected, refreshTree])

  useEffect(() => {
    if (!currentWorkspaceId) {
      commitTree([])
      commitHistory(null)
      setIsLoading(false)
      setErrorText("")
      return
    }

    const restoredHistory = loadWorkspaceHistory(currentWorkspaceId)
    if (restoredHistory) {
      commitTree(restoredHistory.present)
      commitHistory(restoredHistory)
      setIsLoading(false)
      void refreshTree({ silent: true, reconcileHistory: true })
      return
    }

    commitTree([])
    commitHistory(makeEmptyHistory([]))
    void refreshTree()
  }, [commitHistory, commitTree, currentWorkspaceId, refreshTree])

  useEffect(() => {
    flushDeferredRefresh()
  }, [flushDeferredRefresh])

  const { createRowAtPosition, saveRow } = useWorkspaceDraftFlow({
    currentWorkspaceId,
    draftSequenceRef,
    treeRef,
    commitTree,
    setErrorText,
    onCreateFocusRow,
  })

  const deleteRow = useCallback(
    async (id: string) => {
      if (isLocalDraftRowId(id)) {
        discardPendingSave(id)
        commitTree(removeLocalRow(treeRef.current, id))
        onDeleteRow(id)
        return
      }

      const previousTree = treeRef.current
      const optimisticTree = removeLocalRow(previousTree, id)
      const branch = findBranch(previousTree, id)
      const placement = getRowPlacement(previousTree, id)
      if (
        optimisticTree === previousTree ||
        !branch ||
        !placement ||
        !currentWorkspaceId
      ) {
        return
      }

      discardPendingSave(id)
      commitTree(optimisticTree)
      onDeleteRow(id)

      try {
        await deleteWorkItem(id)
        pushHistoryEntry(
          {
            type: "deleteBranch",
            targetParentId: placement.parentId,
            targetIndex: placement.index,
            branch,
          },
          optimisticTree,
        )
        setErrorText("")
      } catch (error) {
        commitTree(previousTree)
        void refreshTree({ silent: true })
        setErrorText(toErrorText(error))
      }
    },
    [
      commitTree,
      currentWorkspaceId,
      discardPendingSave,
      onDeleteRow,
      pushHistoryEntry,
      refreshTree,
      toErrorText,
    ],
  )

  const moveRow = useCallback(
    async (id: string, targetParentId: string | null, targetIndex: number) => {
      const previousTree = treeRef.current
      const optimisticTree = applyOptimisticMove(
        previousTree,
        id,
        targetParentId,
        targetIndex,
      )
      if (optimisticTree === previousTree) {
        return
      }

      if (isLocalDraftRowId(id)) {
        commitTree(optimisticTree)
        return
      }

      const previousPlacement = getRowPlacement(previousTree, id)
      if (!previousPlacement) {
        return
      }

      commitTree(optimisticTree)
      try {
        await moveWorkItem(id, {
          targetParentId,
          targetIndex,
        })
        pushHistoryEntry(
          {
            type: "move",
            rowId: id,
            fromParentId: previousPlacement.parentId,
            fromIndex: previousPlacement.index,
            toParentId: targetParentId,
            toIndex: targetIndex,
          },
          optimisticTree,
        )
        setErrorText("")
      } catch (error) {
        commitTree(previousTree)
        void refreshTree({ silent: true })
        setErrorText(toErrorText(error))
      }
    },
    [commitTree, pushHistoryEntry, refreshTree, toErrorText],
  )

  const { recordPersistedChange, applyHistoryDirection } =
    useWorkspaceHistoryActions({
      currentWorkspaceId,
      isApplyingHistory,
      setIsApplyingHistory,
      setErrorText,
      toErrorText,
      commitTree,
      commitHistory,
      treeRef,
      historyRef,
      onWorkspaceMetricsChange,
      pushHistoryEntry,
    })

  const {
    createMetricInCurrentWorkspace,
    updateMetricInCurrentWorkspace,
    deleteMetricInCurrentWorkspace,
  } = useWorkspaceMetricCatalogActions({
    currentWorkspaceId,
    treeRef,
    workspaceMetricsRef,
    commitTree,
    onWorkspaceMetricsChange,
    pushHistoryEntry,
    setErrorText,
  })

  return {
    tree,
    setTree: updateTree,
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
    canUndo: (historyState?.past.length ?? 0) > 0,
    canRedo: (historyState?.future.length ?? 0) > 0,
    isApplyingHistory,
    recordPersistedChange,
    createMetricInCurrentWorkspace,
    updateMetricInCurrentWorkspace,
    deleteMetricInCurrentWorkspace,
    undo: () => applyHistoryDirection("undo"),
    redo: () => applyHistoryDirection("redo"),
  }
}
