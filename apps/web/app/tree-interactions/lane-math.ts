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
        targetIndex: 0,
        anchorRowId: null,
        anchorPlacement: "empty",
        anchorY: null,
      },
    ]
  }

  const lanes: InsertLane[] = []
  for (const row of rows) {
    const siblings = siblingsByParent.get(row.parentId) ?? []
    const siblingIndex = siblings.findIndex(
      (candidate) => candidate.id === row.id,
    )
    lanes.push({
      id: `lane:before:${row.id}`,
      parentId: row.parentId,
      targetIndex: siblingIndex < 0 ? 0 : siblingIndex,
      anchorRowId: row.id,
      anchorPlacement: "before",
      anchorY: null,
    })
  }

  const lastRow = rows[rows.length - 1]
  const lastSiblings = siblingsByParent.get(lastRow.parentId) ?? []
  lanes.push({
    id: `lane:after:${lastRow.id}`,
    parentId: lastRow.parentId,
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
