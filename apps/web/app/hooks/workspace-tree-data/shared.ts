import type {
  HistoryRowSnapshot,
  WorkspaceHistoryState,
} from "../../history/workspace-history"
import { patchTreeRow } from "../../state/workspace-tree-state"
import type { WorkTreeNode } from "../../state/workspace-tree-state"

export const LOCAL_DRAFT_ROW_ID_PREFIX = "local-draft:"

export function isObjectLike(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object"
}

export function isLocalDraftRowId(id: string) {
  return id.startsWith(LOCAL_DRAFT_ROW_ID_PREFIX)
}

export function removeLocalRow(
  nodes: WorkTreeNode[],
  rowId: string,
): WorkTreeNode[] {
  const nextNodes: WorkTreeNode[] = []
  let changed = false

  for (const node of nodes) {
    if (node.id === rowId) {
      changed = true
      continue
    }
    const nextChildren = removeLocalRow(node.children, rowId)
    if (nextChildren !== node.children) {
      changed = true
      nextNodes.push({ ...node, children: nextChildren })
      continue
    }
    nextNodes.push(node)
  }

  if (!changed) {
    return nodes
  }

  return nextNodes.map((node, index) => ({ ...node, siblingOrder: index }))
}

export function removeMetricFromNodeMaps(
  nodes: WorkTreeNode[],
  metricId: string,
): WorkTreeNode[] {
  return nodes.map((node) => {
    const nextMetricValues = { ...(node.metricValues ?? {}) }
    const nextMetricAggregates = { ...(node.metricAggregates ?? {}) }
    delete nextMetricValues[metricId]
    delete nextMetricAggregates[metricId]

    return {
      ...node,
      metricValues: nextMetricValues,
      metricAggregates: nextMetricAggregates,
      children: removeMetricFromNodeMaps(node.children, metricId),
    }
  })
}

export function restoreMetricValuesIntoTree(
  nodes: WorkTreeNode[],
  snapshot: {
    metric: { id: string }
    removedValues: Array<{
      workItemId: string
      value: "none" | "indirect" | "direct"
    }>
  },
): WorkTreeNode[] {
  let nextTree = removeMetricFromNodeMaps(nodes, snapshot.metric.id)
  for (const entry of snapshot.removedValues) {
    const row = findRow(nextTree, entry.workItemId)
    if (!row || row.children.length > 0) {
      continue
    }

    const nextMetricValues = { ...(row.metricValues ?? {}) }
    if (entry.value === "none") {
      delete nextMetricValues[snapshot.metric.id]
    } else {
      nextMetricValues[snapshot.metric.id] = entry.value
    }
    nextTree = patchTreeRow(nextTree, row.id, {
      metricValues: nextMetricValues,
    })
  }
  return nextTree
}

export function findRow(
  nodes: WorkTreeNode[],
  rowId: string,
): WorkTreeNode | null {
  const queue = [...nodes]
  while (queue.length > 0) {
    const node = queue.shift()
    if (!node) {
      continue
    }
    if (node.id === rowId) {
      return node
    }
    queue.push(...node.children)
  }
  return null
}

export function toHistoryBranchSnapshot(
  row: Pick<
    WorkTreeNode,
    | "id"
    | "workspaceId"
    | "title"
    | "object"
    | "possiblyRemovable"
    | "parentId"
    | "siblingOrder"
    | "overcomplication"
    | "importance"
    | "metricValues"
    | "metricAggregates"
    | "currentProblems"
    | "solutionVariants"
  >,
): HistoryRowSnapshot {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    title: row.title,
    object: row.object,
    possiblyRemovable: row.possiblyRemovable,
    parentId: row.parentId,
    siblingOrder: row.siblingOrder,
    overcomplication: row.overcomplication,
    importance: row.importance,
    metricValues: { ...(row.metricValues ?? {}) },
    metricAggregates: { ...(row.metricAggregates ?? {}) },
    currentProblems: [...row.currentProblems],
    solutionVariants: [...row.solutionVariants],
    children: [],
  }
}

export function toTreePatch(row: HistoryRowSnapshot | WorkTreeNode) {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    title: row.title,
    object: row.object,
    possiblyRemovable: row.possiblyRemovable,
    parentId: row.parentId,
    siblingOrder: row.siblingOrder,
    overcomplication: row.overcomplication,
    importance: row.importance,
    metricValues: { ...(row.metricValues ?? {}) },
    metricAggregates: { ...(row.metricAggregates ?? {}) },
    currentProblems: [...row.currentProblems],
    solutionVariants: [...row.solutionVariants],
  }
}

export function buildPatchPayloadFromSnapshot(
  snapshot: HistoryRowSnapshot,
  currentRow?: Pick<WorkTreeNode, "metricValues"> | null,
) {
  const nextMetricValues = snapshot.metricValues ?? {}
  const currentMetricValues = currentRow?.metricValues ?? {}
  const metricPatch: Record<string, "none" | "indirect" | "direct"> = {}
  const metricIds = new Set([
    ...Object.keys(nextMetricValues),
    ...Object.keys(currentMetricValues),
  ])
  for (const metricId of metricIds) {
    const currentValue = currentMetricValues[metricId] ?? "none"
    const nextValue = nextMetricValues[metricId] ?? "none"
    if (currentValue !== nextValue) {
      metricPatch[metricId] = nextValue
    }
  }

  return {
    title: snapshot.title,
    object: snapshot.object,
    possiblyRemovable: snapshot.possiblyRemovable,
    overcomplication: snapshot.overcomplication,
    importance: snapshot.importance,
    ...(Object.keys(metricPatch).length > 0
      ? { metricValues: metricPatch }
      : {}),
    currentProblems: [...snapshot.currentProblems],
    solutionVariants: [...snapshot.solutionVariants],
  }
}

export function applyHistoryStateTransition(
  state: WorkspaceHistoryState,
  nextPresent: WorkTreeNode[],
  direction: "undo" | "redo",
): WorkspaceHistoryState | null {
  if (direction === "undo") {
    const entry = state.past.at(-1)
    if (!entry) {
      return null
    }
    return {
      version: state.version,
      past: state.past.slice(0, -1),
      present: nextPresent,
      future: [entry, ...state.future],
    }
  }

  const entry = state.future[0]
  if (!entry) {
    return null
  }
  return {
    version: state.version,
    past: [...state.past, entry],
    present: nextPresent,
    future: state.future.slice(1),
  }
}
