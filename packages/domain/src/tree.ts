import { DomainError, DomainErrorCode } from "./errors"
import {
  type RatingTotals,
  addRatingTotals,
  emptyRatingTotals,
  ratingTotalsFromOwnRatings,
} from "./ratings"
import type {
  WorkItem,
  WorkItemId,
  WorkTreeNode,
  WorkTreeReadNode,
} from "./types"

export function assertNoCycle(
  movingNodeId: WorkItemId,
  targetParentId: WorkItemId | null,
  descendantsById: Map<WorkItemId, Set<WorkItemId>>,
) {
  if (targetParentId === null) {
    return
  }
  if (movingNodeId === targetParentId) {
    throw new DomainError(
      DomainErrorCode.CYCLE_DETECTED,
      "A work item cannot be moved inside itself",
    )
  }
  const descendants = descendantsById.get(movingNodeId)
  if (descendants?.has(targetParentId)) {
    throw new DomainError(
      DomainErrorCode.CYCLE_DETECTED,
      "A work item cannot be moved inside its own subtree",
    )
  }
}

export function buildTree(items: WorkItem[]): WorkTreeNode[] {
  const byId = new Map<WorkItemId, WorkTreeNode>()
  const roots: WorkTreeNode[] = []

  for (const item of items) {
    byId.set(item.id, { ...item, children: [] })
  }

  for (const item of items) {
    const node = byId.get(item.id)
    if (!node) continue
    if (item.parentId === null) {
      roots.push(node)
      continue
    }
    const parent = byId.get(item.parentId)
    if (!parent) {
      throw new DomainError(
        DomainErrorCode.PARENT_NOT_FOUND,
        `Parent ${item.parentId} was not found for ${item.id}`,
      )
    }
    parent.children.push(node)
  }

  sortTree(roots)
  return roots
}

function toReadNode(node: WorkTreeNode): [WorkTreeReadNode, RatingTotals] {
  if (node.children.length === 0) {
    const own = ratingTotalsFromOwnRatings(node)
    return [
      {
        ...node,
        children: [],
        ...own,
      },
      own,
    ]
  }

  const children: WorkTreeReadNode[] = []
  let aggregated = emptyRatingTotals()
  for (const child of node.children) {
    const [readChild, childSums] = toReadNode(child)
    children.push(readChild)
    aggregated = addRatingTotals(aggregated, childSums)
  }

  return [
    {
      ...node,
      children,
      ...aggregated,
    },
    aggregated,
  ]
}

export function withScoreSums(tree: WorkTreeNode[]): WorkTreeReadNode[] {
  return tree.map((node) => toReadNode(node)[0])
}

function sortTree(nodes: WorkTreeNode[]) {
  nodes.sort((a, b) => a.siblingOrder - b.siblingOrder)
  for (const node of nodes) {
    sortTree(node.children)
  }
}
