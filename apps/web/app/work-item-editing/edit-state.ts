import {
  areRatingEditValuesEqual,
  buildRatingEditValues,
} from "../workspace-ratings"
import type { EditState, EditableWorkItemRow } from "./types"

function listToMultiline(values: string[]) {
  return values.join("\n")
}

export function buildEditState(row: EditableWorkItemRow): EditState {
  return {
    title: row.title,
    object: row.object ?? "",
    possiblyRemovable: row.possiblyRemovable ?? false,
    ...buildRatingEditValues(row),
    currentProblems: listToMultiline(row.currentProblems),
    solutionVariants: listToMultiline(row.solutionVariants),
  }
}

export function isSameEditState(left: EditState, right: EditState): boolean {
  return (
    left.title === right.title &&
    left.object === right.object &&
    left.possiblyRemovable === right.possiblyRemovable &&
    areRatingEditValuesEqual(left, right) &&
    left.currentProblems === right.currentProblems &&
    left.solutionVariants === right.solutionVariants
  )
}
