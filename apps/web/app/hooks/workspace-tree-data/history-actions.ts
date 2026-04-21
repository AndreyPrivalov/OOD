import { useCallback } from "react"
import {
  type HistoryEntry,
  remapHistoryIds,
  removeBranchFromTree,
  restoreBranchIntoTree,
} from "../../history/workspace-history"
import {
  type WorkTreeNode,
  applyOptimisticMove,
  patchTreeRow,
} from "../../state/workspace-tree-state"
import {
  deleteWorkItem,
  moveWorkItem,
  patchWorkItem,
  restoreWorkItemBranch,
} from "../../work-item-client"
import {
  deleteWorkspaceMetric,
  restoreWorkspaceMetric,
  updateWorkspaceMetric,
} from "../../workspace-metric-client"
import type { WorkspaceMetricSummary } from "../../workspaces/types"
import {
  applyHistoryStateTransition,
  buildPatchPayloadFromSnapshot,
  findRow,
  removeMetricFromNodeMaps,
  restoreMetricValuesIntoTree,
  toHistoryBranchSnapshot,
  toTreePatch,
} from "./shared"

type UseWorkspaceHistoryActionsOptions = {
  currentWorkspaceId: string | null
  isApplyingHistory: boolean
  setIsApplyingHistory: (isApplying: boolean) => void
  setErrorText: (message: string) => void
  toErrorText: (error: unknown) => string
  commitTree: (nextTree: WorkTreeNode[]) => void
  commitHistory: (
    nextHistory: {
      version: number
      past: HistoryEntry[]
      present: WorkTreeNode[]
      future: HistoryEntry[]
    } | null,
  ) => void
  treeRef: { current: WorkTreeNode[] }
  historyRef: {
    current: {
      version: number
      past: HistoryEntry[]
      present: WorkTreeNode[]
      future: HistoryEntry[]
    } | null
  }
  onWorkspaceMetricsChange: (
    workspaceId: string,
    metrics: WorkspaceMetricSummary[],
  ) => void
  pushHistoryEntry: (entry: HistoryEntry, nextPresent: WorkTreeNode[]) => void
}

export function useWorkspaceHistoryActions(
  options: UseWorkspaceHistoryActionsOptions,
) {
  const {
    commitHistory,
    commitTree,
    currentWorkspaceId,
    historyRef,
    isApplyingHistory,
    onWorkspaceMetricsChange,
    pushHistoryEntry,
    setErrorText,
    setIsApplyingHistory,
    toErrorText,
    treeRef,
  } = options

  const recordPersistedChange = useCallback(
    (
      change:
        | { kind: "patch"; before: WorkTreeNode; after: WorkTreeNode }
        | { kind: "create"; before: WorkTreeNode; after: WorkTreeNode },
    ) => {
      if (change.kind === "patch") {
        pushHistoryEntry(
          {
            type: "patch",
            before: toHistoryBranchSnapshot(change.before),
            after: toHistoryBranchSnapshot(change.after),
          },
          treeRef.current,
        )
        return
      }

      pushHistoryEntry(
        {
          type: "createBranch",
          targetParentId: change.after.parentId,
          targetIndex: change.after.siblingOrder,
          branch: toHistoryBranchSnapshot(change.after),
        },
        treeRef.current,
      )
    },
    [pushHistoryEntry, treeRef],
  )

  const applyHistoryDirection = useCallback(
    async (direction: "undo" | "redo") => {
      if (isApplyingHistory || !currentWorkspaceId) {
        return
      }

      const currentHistory = historyRef.current
      if (!currentHistory) {
        return
      }

      const entry =
        direction === "undo"
          ? currentHistory.past.at(-1)
          : currentHistory.future[0]
      if (!entry) {
        return
      }

      setIsApplyingHistory(true)
      try {
        let workingHistory = currentHistory
        let nextPresent = currentHistory.present

        if (entry.type === "patch") {
          const snapshot = direction === "undo" ? entry.before : entry.after
          const currentRow = findRow(currentHistory.present, snapshot.id)
          await patchWorkItem(
            snapshot.id,
            buildPatchPayloadFromSnapshot(snapshot, currentRow),
          )
          nextPresent = patchTreeRow(
            currentHistory.present,
            snapshot.id,
            toTreePatch(snapshot),
          )
        } else if (entry.type === "move") {
          const targetParentId =
            direction === "undo" ? entry.fromParentId : entry.toParentId
          const targetIndex =
            direction === "undo" ? entry.fromIndex : entry.toIndex
          await moveWorkItem(entry.rowId, {
            targetParentId,
            targetIndex,
          })
          nextPresent = applyOptimisticMove(
            currentHistory.present,
            entry.rowId,
            targetParentId,
            targetIndex,
          )
        } else if (entry.type === "metricCatalogCreate") {
          if (direction === "undo") {
            const response = await deleteWorkspaceMetric(
              currentWorkspaceId,
              entry.metric.id,
            )
            onWorkspaceMetricsChange(currentWorkspaceId, response.metrics)
            nextPresent = removeMetricFromNodeMaps(
              workingHistory.present,
              entry.metric.id,
            )
          } else {
            const nextMetrics = await restoreWorkspaceMetric(
              currentWorkspaceId,
              {
                metric: {
                  ...entry.metric,
                },
                targetIndex: entry.targetIndex,
                removedValues: [],
              },
            )
            onWorkspaceMetricsChange(currentWorkspaceId, nextMetrics)
            nextPresent = workingHistory.present
          }
        } else if (entry.type === "metricCatalogUpdate") {
          const metric = direction === "undo" ? entry.before : entry.after
          const nextMetrics = await updateWorkspaceMetric(
            currentWorkspaceId,
            metric.id,
            {
              shortName: metric.shortName,
              description: metric.description,
            },
          )
          onWorkspaceMetricsChange(currentWorkspaceId, nextMetrics)
          nextPresent = workingHistory.present
        } else if (entry.type === "metricCatalogDelete") {
          if (direction === "undo") {
            const nextMetrics = await restoreWorkspaceMetric(
              currentWorkspaceId,
              entry.snapshot,
            )
            onWorkspaceMetricsChange(currentWorkspaceId, nextMetrics)
            nextPresent = restoreMetricValuesIntoTree(
              workingHistory.present,
              entry.snapshot,
            )
          } else {
            const response = await deleteWorkspaceMetric(
              currentWorkspaceId,
              entry.snapshot.metric.id,
            )
            onWorkspaceMetricsChange(currentWorkspaceId, response.metrics)
            nextPresent = removeMetricFromNodeMaps(
              workingHistory.present,
              entry.snapshot.metric.id,
            )
          }
        } else if (entry.type === "deleteBranch") {
          if (direction === "undo") {
            const response = await restoreWorkItemBranch({
              workspaceId: currentWorkspaceId,
              targetParentId: entry.targetParentId,
              targetIndex: entry.targetIndex,
              root: entry.branch,
            })
            workingHistory = remapHistoryIds(workingHistory, response.idMap)
            const remappedEntry = workingHistory.past.at(-1)
            if (!remappedEntry || remappedEntry.type !== "deleteBranch") {
              return
            }
            nextPresent = restoreBranchIntoTree(
              workingHistory.present,
              remappedEntry.branch,
              remappedEntry.targetParentId,
              remappedEntry.targetIndex,
            )
          } else {
            await deleteWorkItem(entry.branch.id)
            nextPresent = removeBranchFromTree(
              workingHistory.present,
              entry.branch.id,
            )
          }
        } else if (direction === "undo") {
          await deleteWorkItem(entry.branch.id)
          nextPresent = removeBranchFromTree(
            workingHistory.present,
            entry.branch.id,
          )
        } else {
          const response = await restoreWorkItemBranch({
            workspaceId: currentWorkspaceId,
            targetParentId: entry.targetParentId,
            targetIndex: entry.targetIndex,
            root: entry.branch,
          })
          workingHistory = remapHistoryIds(workingHistory, response.idMap)
          const remappedEntry = workingHistory.future[0]
          if (!remappedEntry || remappedEntry.type !== "createBranch") {
            return
          }
          nextPresent = restoreBranchIntoTree(
            workingHistory.present,
            remappedEntry.branch,
            remappedEntry.targetParentId,
            remappedEntry.targetIndex,
          )
        }

        const nextHistory = applyHistoryStateTransition(
          workingHistory,
          nextPresent,
          direction,
        )
        if (!nextHistory) {
          return
        }
        commitTree(nextPresent)
        commitHistory(nextHistory)
        setErrorText("")
      } catch (error) {
        setErrorText(toErrorText(error))
      } finally {
        setIsApplyingHistory(false)
      }
    },
    [
      commitHistory,
      commitTree,
      currentWorkspaceId,
      historyRef,
      isApplyingHistory,
      onWorkspaceMetricsChange,
      setErrorText,
      setIsApplyingHistory,
      toErrorText,
    ],
  )

  return {
    recordPersistedChange,
    applyHistoryDirection,
  }
}
