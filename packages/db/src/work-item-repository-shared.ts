import type { UpdateWorkItemInput } from "@ood/domain"

export function clampIndex(index: number, maxLength: number): number {
  if (index < 0) return 0
  if (index > maxLength) return maxLength
  return index
}

export function hasRatingUpdate(patch: UpdateWorkItemInput): boolean {
  return patch.overcomplication !== undefined || patch.importance !== undefined
}
