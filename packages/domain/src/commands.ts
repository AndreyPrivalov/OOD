import type { WorkItemId, WorkspaceId } from "./identifiers"
import type { Rating } from "./ratings"

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

export interface MoveWorkItemInput {
  targetParentId: WorkItemId | null
  targetIndex: number
}
