import { type RatingFieldKey, ratingFieldKeys } from "@ood/domain"

export type WorkspaceRatingValues = Record<RatingFieldKey, number | null>

export type WorkspaceRatingEditValues = Record<RatingFieldKey, string>

export function buildRatingEditValues(
  row: WorkspaceRatingValues,
): WorkspaceRatingEditValues {
  return {
    overcomplication:
      row.overcomplication === null ? "" : String(row.overcomplication),
    importance: row.importance === null ? "" : String(row.importance),
    blocksMoney: row.blocksMoney === null ? "" : String(row.blocksMoney),
  }
}

export function areRatingEditValuesEqual(
  left: WorkspaceRatingEditValues,
  right: WorkspaceRatingEditValues,
): boolean {
  return ratingFieldKeys.every((field) => left[field] === right[field])
}

export function buildRatingServerPatch(
  updated: Partial<WorkspaceRatingValues>,
): Partial<WorkspaceRatingValues> {
  const patch: Partial<WorkspaceRatingValues> = {}

  for (const field of ratingFieldKeys) {
    const nextValue = updated[field]
    if (nextValue === null || typeof nextValue === "number") {
      patch[field] = nextValue
    }
  }

  return patch
}

export function buildRatingPayload(
  currentRow: WorkspaceRatingValues,
  editState: WorkspaceRatingEditValues,
): Partial<WorkspaceRatingValues> {
  const payload: Partial<WorkspaceRatingValues> = {}

  for (const field of ratingFieldKeys) {
    const nextValue = toNullableNumber(editState[field])
    if (nextValue !== currentRow[field]) {
      payload[field] = nextValue
    }
  }

  return payload
}

function toNullableNumber(value: string): number | null {
  if (value.trim().length === 0) {
    return null
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}
