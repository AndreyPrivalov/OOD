import {
  type TreeSelectorCache,
  type TreeSelectorSnapshot,
  deriveTreeSelectors,
} from "./tree-selectors"
import { areSetsEqual, filterVisibleRows } from "./tree-visibility"
import type { WorkTreeNode } from "./workspace-tree-state"

export type MindmapViewportState = {
  x: number
  y: number
  zoom: number
}

export const INITIAL_MINDMAP_VIEWPORT: MindmapViewportState = {
  x: 0,
  y: 0,
  zoom: 1,
}

export type WorkspaceTreeProjectionSnapshot = {
  canonical: TreeSelectorSnapshot
  table: {
    rows: TreeSelectorSnapshot["rows"]
    numberingById: TreeSelectorSnapshot["numberingById"]
    collapsedRowIds: ReadonlySet<string>
  }
  mindmap: {
    rows: TreeSelectorSnapshot["rows"]
    rowsById: TreeSelectorSnapshot["rowsById"]
  }
}

export type WorkspaceTreeProjectionCache = {
  selectorCache: TreeSelectorCache
  snapshot: WorkspaceTreeProjectionSnapshot
}

type DeriveWorkspaceTreeProjectionOptions = {
  tree: WorkTreeNode[]
  collapsedRowIds: ReadonlySet<string>
  previousCache: WorkspaceTreeProjectionCache | null
}

export function deriveWorkspaceTreeProjection(
  options: DeriveWorkspaceTreeProjectionOptions,
): WorkspaceTreeProjectionCache {
  const { collapsedRowIds, previousCache, tree } = options
  const selectorCache = deriveTreeSelectors(
    tree,
    previousCache?.selectorCache ?? null,
  )
  const canonical = selectorCache.snapshot

  if (
    previousCache &&
    canonical === previousCache.snapshot.canonical &&
    collapsedRowIds === previousCache.snapshot.table.collapsedRowIds
  ) {
    return {
      selectorCache,
      snapshot: previousCache.snapshot,
    }
  }

  const tableRows =
    previousCache &&
    previousCache.snapshot.canonical.rows === canonical.rows &&
    areSetsEqual(previousCache.snapshot.table.collapsedRowIds, collapsedRowIds)
      ? previousCache.snapshot.table.rows
      : filterVisibleRows(canonical.rows, collapsedRowIds)

  return {
    selectorCache,
    snapshot: {
      canonical,
      table: {
        rows: tableRows,
        numberingById: canonical.numberingById,
        collapsedRowIds,
      },
      mindmap:
        previousCache && previousCache.snapshot.canonical === canonical
          ? previousCache.snapshot.mindmap
          : {
              rows: canonical.rows,
              rowsById: canonical.rowsById,
            },
    },
  }
}
