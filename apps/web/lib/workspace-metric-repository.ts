import {
  type WorkspaceMetricRepository,
  createWorkspaceMetricRepository,
} from "@ood/db"

declare global {
  // eslint-disable-next-line no-var
  var __oodWorkspaceMetricRepository: WorkspaceMetricRepository | undefined
}

function isWorkspaceMetricRepository(
  value: WorkspaceMetricRepository | undefined,
): value is WorkspaceMetricRepository {
  if (!value) {
    return false
  }

  return (
    typeof value.listMetrics === "function" &&
    typeof value.createMetric === "function" &&
    typeof value.updateMetric === "function" &&
    typeof value.deleteMetric === "function" &&
    typeof value.restoreDeletedMetric === "function" &&
    typeof value.setWorkItemMetricValue === "function" &&
    typeof value.listWorkItemMetricValues === "function"
  )
}

export function getWorkspaceMetricRepository(): WorkspaceMetricRepository {
  if (!isWorkspaceMetricRepository(globalThis.__oodWorkspaceMetricRepository)) {
    globalThis.__oodWorkspaceMetricRepository =
      createWorkspaceMetricRepository()
  }

  return globalThis.__oodWorkspaceMetricRepository
}
