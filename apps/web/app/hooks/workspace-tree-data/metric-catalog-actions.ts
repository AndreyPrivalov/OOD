import { useCallback } from "react"
import type { HistoryEntry } from "../../history/workspace-history"
import type { WorkTreeNode } from "../../state/workspace-tree-state"
import {
  createWorkspaceMetric,
  deleteWorkspaceMetric,
  updateWorkspaceMetric,
} from "../../workspace-metric-client"
import type { WorkspaceMetricSummary } from "../../workspaces/types"
import { removeMetricFromNodeMaps } from "./shared"

type UseWorkspaceMetricCatalogActionsOptions = {
  currentWorkspaceId: string | null
  treeRef: { current: WorkTreeNode[] }
  workspaceMetricsRef: { current: WorkspaceMetricSummary[] }
  commitTree: (nextTree: WorkTreeNode[]) => void
  onWorkspaceMetricsChange: (
    workspaceId: string,
    metrics: WorkspaceMetricSummary[],
  ) => void
  pushHistoryEntry: (entry: HistoryEntry, nextPresent: WorkTreeNode[]) => void
  setErrorText: (message: string) => void
}

export function useWorkspaceMetricCatalogActions(
  options: UseWorkspaceMetricCatalogActionsOptions,
) {
  const {
    commitTree,
    currentWorkspaceId,
    onWorkspaceMetricsChange,
    pushHistoryEntry,
    setErrorText,
    treeRef,
    workspaceMetricsRef,
  } = options

  const createMetricInCurrentWorkspace = useCallback(
    async (
      input: { shortName: string; description: string | null },
      workspaceIdOverride?: string,
    ) => {
      const workspaceId = workspaceIdOverride ?? currentWorkspaceId
      if (!workspaceId) {
        throw new Error("Рабочее пространство не выбрано.")
      }

      const beforeMetrics =
        workspaceId === currentWorkspaceId ? workspaceMetricsRef.current : []
      const nextMetrics = await createWorkspaceMetric(workspaceId, input)
      onWorkspaceMetricsChange(workspaceId, nextMetrics)

      if (workspaceId !== currentWorkspaceId) {
        setErrorText("")
        return nextMetrics
      }

      const createdMetric = nextMetrics.find(
        (metric) => !beforeMetrics.some((before) => before.id === metric.id),
      )
      if (createdMetric) {
        const targetIndex = nextMetrics.findIndex(
          (metric) => metric.id === createdMetric.id,
        )
        pushHistoryEntry(
          {
            type: "metricCatalogCreate",
            metric: createdMetric,
            targetIndex: targetIndex < 0 ? nextMetrics.length : targetIndex,
          },
          treeRef.current,
        )
      }

      setErrorText("")
      return nextMetrics
    },
    [
      currentWorkspaceId,
      onWorkspaceMetricsChange,
      pushHistoryEntry,
      setErrorText,
      treeRef,
      workspaceMetricsRef,
    ],
  )

  const updateMetricInCurrentWorkspace = useCallback(
    async (
      metricId: string,
      input: { shortName: string; description: string | null },
      workspaceIdOverride?: string,
    ) => {
      const workspaceId = workspaceIdOverride ?? currentWorkspaceId
      if (!workspaceId) {
        throw new Error("Рабочее пространство не выбрано.")
      }

      const beforeMetric = workspaceMetricsRef.current.find(
        (metric) => metric.id === metricId,
      )
      const nextMetrics = await updateWorkspaceMetric(
        workspaceId,
        metricId,
        input,
      )
      onWorkspaceMetricsChange(workspaceId, nextMetrics)

      if (workspaceId !== currentWorkspaceId) {
        setErrorText("")
        return nextMetrics
      }

      const afterMetric = nextMetrics.find((metric) => metric.id === metricId)
      if (
        beforeMetric &&
        afterMetric &&
        (beforeMetric.shortName !== afterMetric.shortName ||
          beforeMetric.description !== afterMetric.description)
      ) {
        pushHistoryEntry(
          {
            type: "metricCatalogUpdate",
            before: beforeMetric,
            after: afterMetric,
          },
          treeRef.current,
        )
      }

      setErrorText("")
      return nextMetrics
    },
    [
      currentWorkspaceId,
      onWorkspaceMetricsChange,
      pushHistoryEntry,
      setErrorText,
      treeRef,
      workspaceMetricsRef,
    ],
  )

  const deleteMetricInCurrentWorkspace = useCallback(
    async (metricId: string, workspaceIdOverride?: string) => {
      const workspaceId = workspaceIdOverride ?? currentWorkspaceId
      if (!workspaceId) {
        throw new Error("Рабочее пространство не выбрано.")
      }

      const response = await deleteWorkspaceMetric(workspaceId, metricId)
      if (!response.deletedMetricSnapshot) {
        throw new Error("Сервер не вернул snapshot удалённой метрики.")
      }

      onWorkspaceMetricsChange(workspaceId, response.metrics)
      if (workspaceId !== currentWorkspaceId) {
        setErrorText("")
        return response.metrics
      }

      const nextTree = removeMetricFromNodeMaps(treeRef.current, metricId)
      commitTree(nextTree)
      pushHistoryEntry(
        {
          type: "metricCatalogDelete",
          snapshot: response.deletedMetricSnapshot,
        },
        nextTree,
      )
      setErrorText("")
      return response.metrics
    },
    [
      commitTree,
      currentWorkspaceId,
      onWorkspaceMetricsChange,
      pushHistoryEntry,
      setErrorText,
      treeRef,
    ],
  )

  return {
    createMetricInCurrentWorkspace,
    updateMetricInCurrentWorkspace,
    deleteMetricInCurrentWorkspace,
  }
}
