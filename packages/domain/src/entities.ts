import type { WorkItemId, WorkspaceId } from "./identifiers"
import type { RatingTotals, WorkItemRatings } from "./ratings"

export interface Workspace {
  id: WorkspaceId
  name: string
  createdAt: Date
  updatedAt: Date
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

export interface WorkTreeNode extends WorkItem {
  children: WorkTreeNode[]
}

export interface WorkTreeReadNode extends WorkTreeNode, RatingTotals {
  children: WorkTreeReadNode[]
}
