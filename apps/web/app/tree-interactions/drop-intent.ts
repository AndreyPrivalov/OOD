import type { DropIntent, FlatRowLike } from "./types"

export function isSameDropIntent(
  left: DropIntent | null,
  right: DropIntent | null,
): boolean {
  if (!left && !right) return true
  if (!left || !right) return false
  if (left.type !== right.type) return false
  if (left.type === "nest" && right.type === "nest") {
    return left.targetId === right.targetId
  }
  if (left.type === "between" && right.type === "between") {
    return (
      left.rowId === right.rowId &&
      left.position === right.position &&
      left.parentId === right.parentId &&
      left.targetIndex === right.targetIndex
    )
  }
  if (left.type === "root-start" && right.type === "root-start") {
    return left.targetIndex === right.targetIndex
  }
  return false
}

export function buildBetweenIntent(
  row: FlatRowLike,
  position: "before" | "after",
  movingId: string,
  siblingsByParent: Map<string | null, FlatRowLike[]>,
): DropIntent | null {
  const siblings = (siblingsByParent.get(row.parentId) ?? []).filter(
    (candidate) => candidate.id !== movingId,
  )
  const currentIndex = siblings.findIndex(
    (candidate) => candidate.id === row.id,
  )
  if (currentIndex < 0) {
    return null
  }
  const targetIndex = position === "before" ? currentIndex : currentIndex + 1
  return {
    type: "between",
    rowId: row.id,
    position,
    parentId: row.parentId,
    targetIndex: Math.max(0, targetIndex),
  }
}
