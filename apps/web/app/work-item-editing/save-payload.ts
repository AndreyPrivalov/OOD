import { buildRatingPayload } from "../workspace-ratings"
import type { EditState, EditableWorkItemRow } from "./types"

function multilineToList(value: string) {
  return value
    .split("\n")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
}

function isSameStringList(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false
  }
  return left.every((value, index) => value === right[index])
}

export function buildPatchPayload(
  currentRow: EditableWorkItemRow,
  rowEdit: EditState,
) {
  const payload: Record<string, unknown> = {}
  const nextTitle = rowEdit.title
  if (nextTitle !== currentRow.title) {
    payload.title = nextTitle
  }

  const nextObject = rowEdit.object.trim().length === 0 ? null : rowEdit.object
  if (nextObject !== currentRow.object) {
    payload.object = nextObject
  }

  if (rowEdit.possiblyRemovable !== currentRow.possiblyRemovable) {
    payload.possiblyRemovable = rowEdit.possiblyRemovable
  }

  const isParentRow = currentRow.children.length > 0
  if (!isParentRow) {
    Object.assign(payload, buildRatingPayload(currentRow, rowEdit))
  }

  const nextCurrentProblems = multilineToList(rowEdit.currentProblems)
  if (!isSameStringList(nextCurrentProblems, currentRow.currentProblems)) {
    payload.currentProblems = nextCurrentProblems
  }

  const nextSolutionVariants = multilineToList(rowEdit.solutionVariants)
  if (!isSameStringList(nextSolutionVariants, currentRow.solutionVariants)) {
    payload.solutionVariants = nextSolutionVariants
  }

  return payload
}
