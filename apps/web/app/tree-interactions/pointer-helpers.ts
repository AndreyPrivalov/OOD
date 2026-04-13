import { buildBetweenIntent } from "./drop-intent"
import type { DropIntent, FlatRowLike } from "./types"

type ResolveDropIntentArgs = {
  clientX: number
  clientY: number
  movingId: string
  rowsById: Map<string, FlatRowLike>
  siblingsByParent: Map<string | null, FlatRowLike[]>
  gutterWidth?: number
}

export function resolveDropIntentAtPoint({
  clientX,
  clientY,
  movingId,
  rowsById,
  siblingsByParent,
  gutterWidth = 96,
}: ResolveDropIntentArgs): DropIntent | null {
  if (typeof document === "undefined") {
    return null
  }

  const target = document.elementFromPoint(clientX, clientY)
  if (!(target instanceof HTMLElement)) {
    return null
  }

  const tableElement =
    target.closest("table[data-tree-table]") ??
    document.querySelector("table[data-tree-table]")
  if (tableElement instanceof HTMLTableElement) {
    const firstRootRow = (siblingsByParent.get(null) ?? [])[0] ?? null
    if (firstRootRow) {
      const firstRootTr = tableElement.querySelector(
        `tr[data-row-id='${firstRootRow.id}']`,
      )
      if (firstRootTr instanceof HTMLTableRowElement) {
        const firstRect = firstRootTr.getBoundingClientRect()
        if (clientY < firstRect.top) {
          return { type: "root-start", targetIndex: 0 }
        }
      }
    }
  }

  let rowElement = target.closest("tr[data-row-id]")
  if (
    !(rowElement instanceof HTMLTableRowElement) &&
    tableElement instanceof HTMLTableElement
  ) {
    const fallback = Array.from(
      tableElement.querySelectorAll("tr[data-row-id]"),
    ).find((row) => {
      if (!(row instanceof HTMLTableRowElement)) {
        return false
      }
      const rect = row.getBoundingClientRect()
      return clientY >= rect.top && clientY <= rect.bottom
    })
    rowElement = fallback instanceof HTMLTableRowElement ? fallback : null
  }
  if (!(rowElement instanceof HTMLTableRowElement)) {
    return null
  }

  const rowId = rowElement.dataset.rowId
  if (!rowId || rowId === movingId) {
    return null
  }

  const row = rowsById.get(rowId)
  if (!row) {
    return null
  }

  const rect = rowElement.getBoundingClientRect()
  const relativeY = clientY - rect.top
  const isGutterDrop = clientX <= rect.left + gutterWidth
  if (isGutterDrop) {
    const position = relativeY < rect.height / 2 ? "before" : "after"
    return buildBetweenIntent(row, position, movingId, siblingsByParent)
  }

  const topThreshold = rect.height * 0.4
  const bottomThreshold = rect.height * 0.6

  if (relativeY < topThreshold) {
    return buildBetweenIntent(row, "before", movingId, siblingsByParent)
  }
  if (relativeY > bottomThreshold) {
    return buildBetweenIntent(row, "after", movingId, siblingsByParent)
  }

  return { type: "nest", targetId: row.id }
}
