import type { EditState } from "../../work-item-editing"
import type { WorkspaceMetricSummary } from "../../workspaces/types"

export function buildRowUiRenderSignature(
  edit: EditState,
  workspaceMetrics: WorkspaceMetricSummary[],
) {
  const metricCatalogSignature = workspaceMetrics
    .map((metric) => `${metric.id}:${metric.shortName}`)
    .join("|")

  return [
    edit.title,
    edit.object,
    edit.overcomplication,
    edit.importance,
    metricCatalogSignature,
    ...Object.entries(edit.metricValues)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([metricId, value]) => `${metricId}:${value}`),
    edit.currentProblems,
    edit.solutionVariants,
    edit.possiblyRemovable ? "1" : "0",
  ].join("::")
}
