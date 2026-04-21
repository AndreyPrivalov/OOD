import type { MindmapEdge, MindmapNode } from "@ood/ui"
import type { FlatRow } from "./workspace-tree-state"

const NODE_TEXT_FONT_SIZE = 20
const NODE_TEXT_LEFT_PADDING = 10
const NODE_TEXT_CONNECTION_GAP = 6
const NODE_HEIGHT = 22
const LEVEL_GAP = 56
const ROW_GAP = 18
const BRANCH_EXTERNAL_GAP = ROW_GAP * 1.25
const BRANCH_MIXED_GAP = ROW_GAP * 0.8

export type WorkspaceMindmapDiagram = {
  nodes: MindmapNode[]
  edges: MindmapEdge[]
}

export function buildWorkspaceMindmapDiagram(
  rows: FlatRow[],
): WorkspaceMindmapDiagram {
  const rowsById = new Map(rows.map((row) => [row.id, row]))
  const childrenByParent = new Map<string | null, FlatRow[]>()
  for (const row of rows) {
    const parentId =
      row.parentId && rowsById.has(row.parentId) ? row.parentId : null
    const bucket = childrenByParent.get(parentId)
    if (bucket) {
      bucket.push(row)
      continue
    }
    childrenByParent.set(parentId, [row])
  }

  const geometryById = new Map<
    string,
    {
      x: number
      y: number
      width: number
      height: number
    }
  >()

  const buildLabel = (title: string) =>
    title.trim().length > 0 ? title : "Без названия"

  const estimateCharacterWidthEm = (character: string): number => {
    if (character === " ") {
      return 0.34
    }
    if (/[ilI1\.,:;!'"`|]/.test(character)) {
      return 0.36
    }
    if (/[mwMW@#%&ЖЩШЮжщшю]/.test(character)) {
      return 0.9
    }
    if (character.charCodeAt(0) > 127) {
      return 0.62
    }
    return 0.58
  }

  const estimateLabelWidthPx = (label: string) =>
    Array.from(label).reduce((sum, character) => {
      return sum + estimateCharacterWidthEm(character) * NODE_TEXT_FONT_SIZE
    }, 0)

  const buildNodeWidth = (label: string) =>
    Math.ceil(
      estimateLabelWidthPx(label) +
        NODE_TEXT_LEFT_PADDING +
        NODE_TEXT_CONNECTION_GAP,
    )

  const getMedian = (values: number[]): number => {
    if (values.length === 0) {
      return 0
    }
    const sorted = [...values].sort((left, right) => left - right)
    const middle = Math.floor(sorted.length / 2)
    if (sorted.length % 2 === 0) {
      return (sorted[middle - 1] + sorted[middle]) / 2
    }
    return sorted[middle] ?? 0
  }

  const layoutBranch = (
    row: FlatRow,
    x: number,
    startY: number,
  ): {
    nextY: number
    centerY: number
  } => {
    const label = buildLabel(row.title)
    const width = buildNodeWidth(label)
    const children = childrenByParent.get(row.id) ?? []
    if (children.length === 0) {
      geometryById.set(row.id, {
        x,
        y: startY,
        width,
        height: NODE_HEIGHT,
      })
      return {
        nextY: startY + NODE_HEIGHT + ROW_GAP,
        centerY: startY + NODE_HEIGHT / 2,
      }
    }

    let childCursorY = startY
    const childCenters: number[] = []
    for (const [index, child] of children.entries()) {
      const childLayout = layoutBranch(
        child,
        x + width + LEVEL_GAP,
        childCursorY,
      )
      childCursorY = childLayout.nextY
      childCenters.push(childLayout.centerY)
      const nextChild = children[index + 1]
      if (!nextChild) {
        continue
      }
      const isChildLeaf = child.children.length === 0
      const isNextChildLeaf = nextChild.children.length === 0
      if (isChildLeaf && isNextChildLeaf) {
        continue
      }
      if (!isChildLeaf && !isNextChildLeaf) {
        childCursorY += BRANCH_EXTERNAL_GAP
        continue
      }
      childCursorY += BRANCH_MIXED_GAP
    }

    const centerY =
      childCenters.length > 0
        ? getMedian(childCenters)
        : startY + NODE_HEIGHT / 2
    geometryById.set(row.id, {
      x,
      y: centerY - NODE_HEIGHT / 2,
      width,
      height: NODE_HEIGHT,
    })

    return { nextY: childCursorY, centerY }
  }

  let cursorY = 0
  for (const root of childrenByParent.get(null) ?? []) {
    const rootLayout = layoutBranch(root, 0, cursorY)
    cursorY = rootLayout.nextY
  }

  const nodes: MindmapNode[] = []
  const edges: MindmapEdge[] = []

  for (const row of rows) {
    const geometry = geometryById.get(row.id)
    if (!geometry) {
      continue
    }
    const label = buildLabel(row.title)
    nodes.push({
      id: row.id,
      label,
      x: geometry.x,
      y: geometry.y,
      width: geometry.width,
      height: geometry.height,
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

type BuildActiveNodeIdsOptions = {
  activeRowId: string | null
  rowsById: ReadonlyMap<string, FlatRow>
}

export function buildActiveNodeIds(
  options: BuildActiveNodeIdsOptions,
): string[] {
  const { activeRowId, rowsById } = options
  if (!activeRowId) {
    return []
  }

  const row = rowsById.get(activeRowId)
  if (!row) {
    return []
  }

  const ids = new Set<string>([row.id])
  for (const child of row.children) {
    ids.add(child.id)
  }

  return [...ids]
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
  const directChildren = siblingsByParent.get(row.id) ?? []
  for (const child of directChildren) {
    ids.add(child.id)
  }

  if (directChildren.length === 0) {
    let ancestorId = row.parentId
    while (ancestorId) {
      ids.add(ancestorId)
      const ancestor = rowsById.get(ancestorId)
      ancestorId = ancestor?.parentId ?? null
    }
  }

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
