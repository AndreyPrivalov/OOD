import type { WorkspaceRatingEditValues } from "../workspace-ratings"

export type EditableWorkItemRow = {
  id: string
  title: string
  object: string | null
  possiblyRemovable: boolean
  overcomplication: number | null
  importance: number | null
  blocksMoney: number | null
  currentProblems: string[]
  solutionVariants: string[]
  children: Array<{ id: string }>
}

export type EditableWorkItemPatch = Partial<
  Omit<EditableWorkItemRow, "children">
>

export type EditState = {
  title: string
  object: string
  possiblyRemovable: boolean
  currentProblems: string
  solutionVariants: string
} & WorkspaceRatingEditValues

export type RowEditPatch = {
  title?: string
  object?: string
  possiblyRemovable?: boolean
  overcomplication?: string
  importance?: string
  blocksMoney?: string
  currentProblems?: string
  solutionVariants?: string
}

export type RowEditMeta = {
  isDirty: boolean
  isFocused: boolean
  hasUnackedChanges: boolean
}
