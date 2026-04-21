import {
  areRatingEditValuesEqual,
  buildRatingEditValues,
} from "../workspace-ratings"
import type { EditState, EditableWorkItemRow } from "./types"

function listToMultiline(values: string[]) {
  return values.join("\n")
}

function areMetricValuesEqual(
  left: Record<string, string>,
  right: Record<string, string>,
) {
  const allKeys = new Set([...Object.keys(left), ...Object.keys(right)])
  for (const key of allKeys) {
    if ((left[key] ?? "none") !== (right[key] ?? "none")) {
      return false
    }
  }
  return true
}

export function buildEditState(row: EditableWorkItemRow): EditState {
  return {
    title: row.title,
    object: row.object ?? "",
    possiblyRemovable: row.possiblyRemovable ?? false,
    metricValues: { ...(row.metricValues ?? {}) },
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
    areMetricValuesEqual(left.metricValues, right.metricValues) &&
    areRatingEditValuesEqual(left, right) &&
    left.currentProblems === right.currentProblems &&
    left.solutionVariants === right.solutionVariants
  )
}
