import type { Workspace, WorkspaceMetric } from "@ood/domain"

export interface WorkspaceMetricSettingsView {
  id: string
  shortName: string
  description: string | null
}

export interface WorkspaceSettingsView {
  workspace: {
    id: string
    name: string
    createdAt: string
    updatedAt: string
  }
  metrics: WorkspaceMetricSettingsView[]
}

function serializeWorkspace(
  workspace: Workspace,
): WorkspaceSettingsView["workspace"] {
  return {
    id: workspace.id,
    name: workspace.name,
    createdAt: workspace.createdAt.toISOString(),
    updatedAt: workspace.updatedAt.toISOString(),
  }
}

function serializeMetric(metric: WorkspaceMetric): WorkspaceMetricSettingsView {
  return {
    id: metric.id,
    shortName: metric.shortName,
    description: metric.description ?? null,
  }
}

export function serializeWorkspaceSettings(
  workspace: Workspace,
  metrics: WorkspaceMetric[],
): WorkspaceSettingsView {
  return {
    workspace: serializeWorkspace(workspace),
    metrics: metrics.map(serializeMetric),
  }
}
