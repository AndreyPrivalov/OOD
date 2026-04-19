import {
  type FlatRow,
  type WorkTreeNode,
  buildTreeNumbering,
} from "./workspace-tree-state"

type StructureRow = {
  id: string
  parentId: string | null
  siblingOrder: number
  depth: number
}

type FlatRowCacheEntry = {
  node: WorkTreeNode
  depth: number
  row: FlatRow
}

type TreeSelectorMaps = {
  numberingById: Map<string, string>
  siblingsByParent: Map<string | null, FlatRow[]>
  rowsById: Map<string, FlatRow>
}

export type TreeSelectorSnapshot = TreeSelectorMaps & {
  rows: FlatRow[]
}

export type TreeSelectorCache = {
  flatRowsById: Map<string, FlatRowCacheEntry>
  structure: StructureRow[]
  snapshot: TreeSelectorSnapshot
}

function flattenWithIdentity(
  nodes: WorkTreeNode[],
  previousFlatRowsById: Map<string, FlatRowCacheEntry>,
  nextFlatRowsById: Map<string, FlatRowCacheEntry>,
  rows: FlatRow[],
  structure: StructureRow[],
  depth = 0,
) {
  for (const node of nodes) {
    const previous = previousFlatRowsById.get(node.id)
    const row =
      previous && previous.node === node && previous.depth === depth
        ? previous.row
        : { ...node, depth }

    nextFlatRowsById.set(node.id, { node, depth, row })
    rows.push(row)
    structure.push({
      id: row.id,
      parentId: row.parentId,
      siblingOrder: row.siblingOrder,
      depth,
    })

    flattenWithIdentity(
      node.children,
      previousFlatRowsById,
      nextFlatRowsById,
      rows,
      structure,
      depth + 1,
    )
  }
}

function isSameStructure(
  previous: StructureRow[],
  next: StructureRow[],
): boolean {
  if (previous.length !== next.length) {
    return false
  }

  for (let index = 0; index < next.length; index += 1) {
    const previousRow = previous[index]
    const nextRow = next[index]
    if (
      previousRow.id !== nextRow.id ||
      previousRow.parentId !== nextRow.parentId ||
      previousRow.siblingOrder !== nextRow.siblingOrder ||
      previousRow.depth !== nextRow.depth
    ) {
      return false
    }
  }

  return true
}

function buildRowsById(rows: FlatRow[]) {
  const map = new Map<string, FlatRow>()
  for (const row of rows) {
    map.set(row.id, row)
  }
  return map
}

function buildSiblingsByParent(rows: FlatRow[]) {
  const map = new Map<string | null, FlatRow[]>()
  for (const row of rows) {
    const bucket = map.get(row.parentId) ?? []
    bucket.push(row)
    map.set(row.parentId, bucket)
  }
  for (const bucket of map.values()) {
    bucket.sort((left, right) => left.siblingOrder - right.siblingOrder)
  }
  return map
}

function patchRowsById(
  previousRowsById: Map<string, FlatRow>,
  changedIds: Set<string>,
  nextRowsById: Map<string, FlatRow>,
) {
  if (changedIds.size === 0) {
    return previousRowsById
  }

  const map = new Map(previousRowsById)
  for (const id of changedIds) {
    const nextRow = nextRowsById.get(id)
    if (nextRow) {
      map.set(id, nextRow)
    }
  }
  return map
}

function patchSiblingsByParent(
  previousSiblingsByParent: Map<string | null, FlatRow[]>,
  previousRowsById: Map<string, FlatRow>,
  nextRowsById: Map<string, FlatRow>,
  changedIds: Set<string>,
) {
  if (changedIds.size === 0) {
    return previousSiblingsByParent
  }

  let nextMap: Map<string | null, FlatRow[]> | null = null
  const clonedBuckets = new Set<string | null>()

  for (const id of changedIds) {
    const previousRow = previousRowsById.get(id)
    const nextRow = nextRowsById.get(id)
    if (!previousRow || !nextRow || previousRow.parentId !== nextRow.parentId) {
      continue
    }

    const parentId = nextRow.parentId
    const sourceMap = nextMap ?? previousSiblingsByParent
    const sourceBucket = sourceMap.get(parentId)
    if (!sourceBucket) {
      continue
    }

    if (!nextMap) {
      nextMap = new Map(previousSiblingsByParent)
    }

    const mapBucket = nextMap.get(parentId)
    if (!mapBucket) {
      continue
    }

    const editableBucket =
      clonedBuckets.has(parentId) || mapBucket !== sourceBucket
        ? mapBucket
        : [...mapBucket]

    if (!clonedBuckets.has(parentId) && editableBucket !== mapBucket) {
      nextMap.set(parentId, editableBucket)
      clonedBuckets.add(parentId)
    }

    const index = editableBucket.findIndex((row) => row.id === id)
    if (index >= 0) {
      editableBucket[index] = nextRow
    }
  }

  return nextMap ?? previousSiblingsByParent
}

export function deriveTreeSelectors(
  tree: WorkTreeNode[],
  previousCache: TreeSelectorCache | null,
): TreeSelectorCache {
  const previousFlatRowsById = previousCache?.flatRowsById ?? new Map()
  const flatRowsById = new Map<string, FlatRowCacheEntry>()
  const rows: FlatRow[] = []
  const structure: StructureRow[] = []

  flattenWithIdentity(
    tree,
    previousFlatRowsById,
    flatRowsById,
    rows,
    structure,
    0,
  )

  if (!previousCache) {
    const snapshot = {
      rows,
      numberingById: buildTreeNumbering(tree),
      rowsById: buildRowsById(rows),
      siblingsByParent: buildSiblingsByParent(rows),
    }
    return {
      flatRowsById,
      structure,
      snapshot,
    }
  }

  const structureStable = isSameStructure(previousCache.structure, structure)
  if (!structureStable) {
    const snapshot = {
      rows,
      numberingById: buildTreeNumbering(tree),
      rowsById: buildRowsById(rows),
      siblingsByParent: buildSiblingsByParent(rows),
    }
    return {
      flatRowsById,
      structure,
      snapshot,
    }
  }

  const previousRows = previousCache.snapshot.rows
  let rowsStable = previousRows.length === rows.length
  const changedIds = new Set<string>()

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]
    const previousRow = previousRows[index]
    if (row !== previousRow) {
      rowsStable = false
      changedIds.add(row.id)
    }
  }

  const nextRows = rowsStable ? previousRows : rows
  if (rowsStable) {
    return {
      flatRowsById,
      structure,
      snapshot: previousCache.snapshot,
    }
  }

  const nextRowsById = buildRowsById(nextRows)
  const rowsById = patchRowsById(
    previousCache.snapshot.rowsById,
    changedIds,
    nextRowsById,
  )
  const siblingsByParent = patchSiblingsByParent(
    previousCache.snapshot.siblingsByParent,
    previousCache.snapshot.rowsById,
    nextRowsById,
    changedIds,
  )

  return {
    flatRowsById,
    structure,
    snapshot: {
      rows: nextRows,
      numberingById: previousCache.snapshot.numberingById,
      rowsById,
      siblingsByParent,
    },
  }
}
