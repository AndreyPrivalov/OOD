export type EditableFieldKey =
  | "title"
  | "object"
  | "currentProblems"
  | "solutionVariants"

export type ActiveFieldSnapshot = {
  rowId: string
  field: EditableFieldKey
  value: string
}

type ClosestRowElementLike = {
  getAttribute: (name: string) => string | null
}

type ActiveFieldElementLike = {
  value?: unknown
  dataset?: { rowField?: unknown }
  closest?: (selector: string) => ClosestRowElementLike | null
}

const editableFieldKeys = new Set<EditableFieldKey>([
  "title",
  "object",
  "currentProblems",
  "solutionVariants",
])

export function readActiveFieldSnapshot(
  activeElement: ActiveFieldElementLike | null,
): ActiveFieldSnapshot | null {
  if (!activeElement || typeof activeElement.value !== "string") {
    return null
  }

  const field = activeElement.dataset?.rowField
  if (!field || !editableFieldKeys.has(field as EditableFieldKey)) {
    return null
  }

  const rowElement =
    typeof activeElement.closest === "function"
      ? activeElement.closest("tr[data-row-id]")
      : null
  const rowId = rowElement?.getAttribute("data-row-id")
  if (!rowId) {
    return null
  }

  return {
    rowId,
    field: field as EditableFieldKey,
    value: activeElement.value,
  }
}
