export type WorkspaceMetricSummary = {
  id: string
  shortName: string
  description: string | null
}

export type WorkspaceSummary = {
  id: string
  name: string
  metrics: WorkspaceMetricSummary[]
}
