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

function buildMetricPatch(
  currentValues: Record<string, "none" | "indirect" | "direct">,
  nextValues: Record<string, "none" | "indirect" | "direct">,
) {
  const changed: Record<string, "none" | "indirect" | "direct"> = {}
  const allKeys = new Set([
    ...Object.keys(currentValues),
    ...Object.keys(nextValues),
  ])

  for (const metricId of allKeys) {
    const currentValue = currentValues[metricId] ?? "none"
    const nextValue = nextValues[metricId] ?? "none"
    if (currentValue !== nextValue) {
      changed[metricId] = nextValue
    }
  }

  return changed
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
    const metricPatch = buildMetricPatch(
      currentRow.metricValues ?? {},
      rowEdit.metricValues,
    )
    if (Object.keys(metricPatch).length > 0) {
      payload.metricValues = metricPatch
    }
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
