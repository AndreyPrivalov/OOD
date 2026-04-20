import type { WorkItemId, WorkspaceId } from "./identifiers"
import type { RatingTotals, WorkItemRatings } from "./ratings"
import type { WorkItemMetricValues, WorkspaceMetric } from "./workspace-metrics"

export interface Workspace {
  id: WorkspaceId
  name: string
  createdAt: Date
  updatedAt: Date
}

export interface CanonicalWorkspace extends Workspace {
  metrics: WorkspaceMetric[]
}

export interface WorkItem extends WorkItemRatings {
  id: WorkItemId
  workspaceId: WorkspaceId
  title: string
  object: string | null
  possiblyRemovable: boolean
  parentId: WorkItemId | null
  siblingOrder: number
  currentProblems: string[]
  solutionVariants: string[]
  createdAt: Date
  updatedAt: Date
}

export interface CanonicalWorkItem {
  id: WorkItemId
  workspaceId: WorkspaceId
  title: string
  object: string | null
  possiblyRemovable: boolean
  parentId: WorkItemId | null
  siblingOrder: number
  overcomplication: WorkItemRatings["overcomplication"]
  importance: WorkItemRatings["importance"]
  metricValues: WorkItemMetricValues
  currentProblems: string[]
  solutionVariants: string[]
  createdAt: Date
  updatedAt: Date
}

export interface WorkTreeNode extends WorkItem {
  children: WorkTreeNode[]
}

export interface WorkTreeReadNode extends WorkTreeNode, RatingTotals {
  children: WorkTreeReadNode[]
}
