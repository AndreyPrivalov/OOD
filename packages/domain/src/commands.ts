import type { WorkItemId, WorkspaceId } from "./identifiers"
import type { Rating } from "./ratings"
import type { WorkItemMetricValues } from "./workspace-metrics"

export interface CreateWorkItemInput {
  workspaceId: WorkspaceId
  title: string
  object?: string | null
  possiblyRemovable?: boolean
  parentId?: WorkItemId | null
  siblingOrder?: number
  overcomplication?: Rating | null
  importance?: Rating | null
  blocksMoney?: Rating | null
  currentProblems?: string[]
  solutionVariants?: string[]
}

export interface CanonicalCreateWorkItemInput {
  workspaceId: WorkspaceId
  title: string
  object?: string | null
  possiblyRemovable?: boolean
  parentId?: WorkItemId | null
  siblingOrder?: number
  overcomplication?: Rating | null
  importance?: Rating | null
  metricValues?: WorkItemMetricValues
  currentProblems?: string[]
  solutionVariants?: string[]
}

export interface UpdateWorkItemInput {
  title?: string
  object?: string | null
  possiblyRemovable?: boolean
  overcomplication?: Rating | null
  importance?: Rating | null
  blocksMoney?: Rating | null
  currentProblems?: string[]
  solutionVariants?: string[]
}

export interface CanonicalUpdateWorkItemInput {
  title?: string
  object?: string | null
  possiblyRemovable?: boolean
  overcomplication?: Rating | null
  importance?: Rating | null
  metricValues?: WorkItemMetricValues
  currentProblems?: string[]
  solutionVariants?: string[]
}

export interface MoveWorkItemInput {
  targetParentId: WorkItemId | null
  targetIndex: number
}

export interface RestoreWorkItemSnapshot {
  id: WorkItemId
  workspaceId: WorkspaceId
  title: string
  object: string | null
  possiblyRemovable: boolean
  parentId: WorkItemId | null
  siblingOrder: number
  overcomplication?: Rating | null
  importance?: Rating | null
  blocksMoney?: Rating | null
  metricValues?: WorkItemMetricValues
  currentProblems: string[]
  solutionVariants: string[]
  children: RestoreWorkItemSnapshot[]
}

export interface CanonicalRestoreWorkItemSnapshot {
  id: WorkItemId
  workspaceId: WorkspaceId
  title: string
  object: string | null
  possiblyRemovable: boolean
  parentId: WorkItemId | null
  siblingOrder: number
  overcomplication?: Rating | null
  importance?: Rating | null
  metricValues?: WorkItemMetricValues
  currentProblems: string[]
  solutionVariants: string[]
  children: CanonicalRestoreWorkItemSnapshot[]
}

export interface RestoreWorkItemBranchInput {
  workspaceId: WorkspaceId
  targetParentId: WorkItemId | null
  targetIndex: number
  root: RestoreWorkItemSnapshot
}
