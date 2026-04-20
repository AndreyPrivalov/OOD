import type { FlatRowLike, InsertLane, RowAnchor } from "./types"

export function buildInsertLanes(
  rows: FlatRowLike[],
  siblingsByParent: Map<string | null, FlatRowLike[]>,
): InsertLane[] {
  if (rows.length === 0) {
    return [
      {
        id: "lane:empty-root",
        parentId: null,
        depth: 0,
        targetIndex: 0,
        anchorRowId: null,
        anchorPlacement: "empty",
        anchorY: null,
      },
    ]
  }

  const lanes: InsertLane[] = []
  const firstRow = rows[0]
  const firstSiblings = siblingsByParent.get(firstRow.parentId) ?? []
  const firstSiblingIndex = firstSiblings.findIndex(
    (candidate) => candidate.id === firstRow.id,
  )
  lanes.push({
    id: `lane:before:${firstRow.id}`,
    parentId: firstRow.parentId,
    depth: firstRow.depth,
    targetIndex: firstSiblingIndex < 0 ? 0 : firstSiblingIndex,
    anchorRowId: firstRow.id,
    anchorPlacement: "before",
    anchorY: null,
  })

  for (let index = 1; index < rows.length; index += 1) {
    const upperRow = rows[index - 1]
    const lowerRow = rows[index]
    const shouldUseLowerLevel = upperRow.depth < lowerRow.depth
    const anchorRow = shouldUseLowerLevel ? lowerRow : upperRow
    const siblings = siblingsByParent.get(anchorRow.parentId) ?? []
    const siblingIndex = siblings.findIndex(
      (candidate) => candidate.id === anchorRow.id,
    )
    lanes.push({
      id: `lane:between:${upperRow.id}:${lowerRow.id}`,
      parentId: anchorRow.parentId,
      depth: anchorRow.depth,
      targetIndex:
        siblingIndex < 0
          ? 0
          : shouldUseLowerLevel
            ? siblingIndex
            : siblingIndex + 1,
      anchorRowId: lowerRow.id,
      anchorPlacement: "before",
      anchorY: null,
    })
  }

  const lastRow = rows[rows.length - 1]
  const lastSiblings = siblingsByParent.get(lastRow.parentId) ?? []
  lanes.push({
    id: `lane:after:${lastRow.id}`,
    parentId: lastRow.parentId,
    depth: lastRow.depth,
    targetIndex: lastSiblings.length,
    anchorRowId: lastRow.id,
    anchorPlacement: "after-last",
    anchorY: null,
  })
  return lanes
}

export function withLaneAnchors(
  lanes: InsertLane[],
  rowAnchors: Record<string, RowAnchor>,
  headerBottom: number,
): InsertLane[] {
  return lanes.map((lane) => {
    if (lane.anchorPlacement === "empty") {
      return { ...lane, anchorY: headerBottom }
    }

    if (!lane.anchorRowId) {
      return lane
    }

    const anchor = rowAnchors[lane.anchorRowId]
    if (!anchor) {
      return lane
    }

    return {
      ...lane,
      anchorY: lane.anchorPlacement === "before" ? anchor.top : anchor.bottom,
    }
  })
}
