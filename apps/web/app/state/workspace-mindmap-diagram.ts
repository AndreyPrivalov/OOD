import type { MindmapEdge, MindmapNode } from "@ood/ui"
import type { FlatRow } from "./workspace-tree-state"

const NODE_WIDTH = 220
const NODE_HEIGHT = 44
const LEVEL_GAP = 56
const ROW_GAP = 18

export type WorkspaceMindmapDiagram = {
  nodes: MindmapNode[]
  edges: MindmapEdge[]
}

export function buildWorkspaceMindmapDiagram(
  rows: FlatRow[],
): WorkspaceMindmapDiagram {
  const nodes: MindmapNode[] = []
  const edges: MindmapEdge[] = []

  for (const [index, row] of rows.entries()) {
    nodes.push({
      id: row.id,
      label: row.title.trim().length > 0 ? row.title : "Без названия",
      x: row.depth * (NODE_WIDTH + LEVEL_GAP),
      y: index * (NODE_HEIGHT + ROW_GAP),
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    })

    if (row.parentId) {
      edges.push({
        id: `${row.parentId}__${row.id}`,
        fromId: row.parentId,
        toId: row.id,
      })
    }
  }

  return { nodes, edges }
}

type BuildEditingContextNodeIdsOptions = {
  editingContextRowId: string | null
  rowsById: ReadonlyMap<string, FlatRow>
  siblingsByParent: ReadonlyMap<string | null, FlatRow[]>
}

export function buildEditingContextNodeIds(
  options: BuildEditingContextNodeIdsOptions,
): string[] {
  const { editingContextRowId, rowsById, siblingsByParent } = options
  if (!editingContextRowId) {
    return []
  }

  const row = rowsById.get(editingContextRowId)
  if (!row) {
    return []
  }

  const ids = new Set<string>([row.id])
  if (!row.parentId) {
    for (const sibling of siblingsByParent.get(null) ?? []) {
      ids.add(sibling.id)
    }
    return [...ids]
  }

  ids.add(row.parentId)
  for (const sibling of siblingsByParent.get(row.parentId) ?? []) {
    ids.add(sibling.id)
  }

  return [...ids]
}
