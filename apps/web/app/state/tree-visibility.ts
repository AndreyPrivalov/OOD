type TreeRowVisibilityLike = {
  id: string
  depth: number
  children: unknown[]
}

export function filterVisibleRows<Row extends TreeRowVisibilityLike>(
  rows: readonly Row[],
  collapsedRowIds: ReadonlySet<string>,
): Row[] {
  const visibleRows: Row[] = []
  let hiddenDepth: number | null = null

  for (const row of rows) {
    if (hiddenDepth !== null) {
      if (row.depth > hiddenDepth) {
        continue
      }
      hiddenDepth = null
    }

    visibleRows.push(row)
    if (collapsedRowIds.has(row.id)) {
      hiddenDepth = row.depth
    }
  }

  return visibleRows
}

export function pruneCollapsedRowIds<Row extends TreeRowVisibilityLike>(
  rows: readonly Row[],
  collapsedRowIds: ReadonlySet<string>,
): Set<string> {
  const collapsibleIds = new Set(
    rows.filter((row) => row.children.length > 0).map((row) => row.id),
  )

  const next = new Set<string>()
  for (const rowId of collapsedRowIds) {
    if (collapsibleIds.has(rowId)) {
      next.add(rowId)
    }
  }

  return next
}

export function areSetsEqual<T>(
  left: ReadonlySet<T>,
  right: ReadonlySet<T>,
): boolean {
  if (left.size !== right.size) {
    return false
  }
  for (const value of left) {
    if (!right.has(value)) {
      return false
    }
  }
  return true
}
