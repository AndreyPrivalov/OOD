import type { RatingFieldKey } from "@ood/domain"
import {
  type WorkspaceRatingValues,
  buildRatingServerPatch,
} from "../workspace-ratings"
import type { EditableWorkItemPatch, EditableWorkItemRow } from "./types"

const RATING_PATCH_KEYS = [
  "overcomplication",
  "importance",
  "blocksMoney",
] satisfies RatingFieldKey[]

export function buildRowPatchFromServer(
  updated: Partial<EditableWorkItemRow>,
): EditableWorkItemPatch {
  const patch: EditableWorkItemPatch = {}
  if (typeof updated.id === "string" && updated.id.length > 0) {
    patch.id = updated.id
  }
  if (typeof updated.title === "string") {
    patch.title = updated.title
  }
  if (updated.object === null || typeof updated.object === "string") {
    patch.object = updated.object
  }
  if (typeof updated.possiblyRemovable === "boolean") {
    patch.possiblyRemovable = updated.possiblyRemovable
  }
  Object.assign(
    patch,
    buildRatingServerPatch(updated as Partial<WorkspaceRatingValues>),
  )
  if (Array.isArray(updated.currentProblems)) {
    patch.currentProblems = updated.currentProblems.filter(
      (item): item is string => typeof item === "string",
    )
  }
  if (Array.isArray(updated.solutionVariants)) {
    patch.solutionVariants = updated.solutionVariants.filter(
      (item): item is string => typeof item === "string",
    )
  }
  return patch
}

function isSamePrimitiveOrList(left: unknown, right: unknown): boolean {
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) {
      return false
    }
    return left.every((item, index) => item === right[index])
  }
  return left === right
}

export function isServerPatchEchoingPayload(
  patch: EditableWorkItemPatch,
  payload: Record<string, unknown>,
): boolean {
  const entries = Object.entries(patch)
  if (entries.length === 0) {
    return false
  }
  return entries.every(([key, value]) =>
    isSamePrimitiveOrList(value, payload[key]),
  )
}

export function shouldApplyConfirmedTreePatch(
  patch: EditableWorkItemPatch,
  payload: Record<string, unknown>,
): boolean {
  if (Object.keys(patch).length === 0) {
    return false
  }

  if (!isServerPatchEchoingPayload(patch, payload)) {
    return true
  }

  return RATING_PATCH_KEYS.some((key) => key in patch)
}
