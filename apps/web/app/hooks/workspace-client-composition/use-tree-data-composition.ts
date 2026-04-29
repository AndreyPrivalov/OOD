"use client"

import type { WorkspaceMetricSummary } from "../../workspaces/types"
import { useWorkspaceTreeData } from "../use-workspace-tree-data"

type UseWorkspaceTreeDataCompositionOptions = {
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

export function useWorkspaceTreeDataComposition(
  options: UseWorkspaceTreeDataCompositionOptions,
) {
  return {
    ...useWorkspaceTreeData(options),
  }
}
