import type { RowAnchor } from "../../tree-interactions"

export type RowAnchorMap = Record<string, RowAnchor>

export function parseRowIdFromTextareaKey(key: string): string | null {
  const separatorIndex = key.lastIndexOf(":")
  if (separatorIndex < 0 || separatorIndex === key.length - 1) {
    return null
  }
  return key.slice(separatorIndex + 1)
}

export function removeRowAnchor(
  current: RowAnchorMap,
  rowId: string,
): RowAnchorMap {
  if (!(rowId in current)) {
    return current
  }
  const next = { ...current }
  delete next[rowId]
  return next
}

export function applyMeasuredRowAnchor(
  current: RowAnchorMap,
  rowOrder: readonly string[],
  rowId: string,
  nextAnchor: RowAnchor,
): RowAnchorMap {
  const previousAnchor = current[rowId]
  if (
    previousAnchor &&
    previousAnchor.top === nextAnchor.top &&
    previousAnchor.bottom === nextAnchor.bottom
  ) {
    return current
  }

  const next = { ...current, [rowId]: nextAnchor }
  if (!previousAnchor) {
    return next
  }

  const shiftDelta = nextAnchor.bottom - previousAnchor.bottom
  if (shiftDelta === 0) {
    return next
  }

  const startIndex = rowOrder.indexOf(rowId)
  if (startIndex < 0) {
    return next
  }

  for (let index = startIndex + 1; index < rowOrder.length; index += 1) {
    const followingId = rowOrder[index]
    const followingAnchor = next[followingId]
    if (!followingAnchor) {
      continue
    }
    next[followingId] = {
      top: followingAnchor.top + shiftDelta,
      bottom: followingAnchor.bottom + shiftDelta,
    }
  }

  return next
}
