import type { WorkTreeNode } from "../state/workspace-tree-state"

export type HistoryRowSnapshot = Omit<WorkTreeNode, "children"> & {
  children: HistoryRowSnapshot[]
}

export type HistoryEntry =
  | {
      type: "patch"
      before: HistoryRowSnapshot
      after: HistoryRowSnapshot
    }
  | {
      type: "move"
      rowId: string
      fromParentId: string | null
      fromIndex: number
      toParentId: string | null
      toIndex: number
    }
  | {
      type: "deleteBranch"
      targetParentId: string | null
      targetIndex: number
      branch: HistoryRowSnapshot
    }
  | {
      type: "createBranch"
      targetParentId: string | null
      targetIndex: number
      branch: HistoryRowSnapshot
    }

export type WorkspaceHistoryState = {
  version: number
  past: HistoryEntry[]
  present: WorkTreeNode[]
  future: HistoryEntry[]
}

const HISTORY_VERSION = 1
const STORAGE_PREFIX = "ood:workspace-history:v1:"

function cloneBranch<T extends HistoryRowSnapshot | WorkTreeNode>(node: T): T {
  return {
    ...node,
    currentProblems: [...node.currentProblems],
    solutionVariants: [...node.solutionVariants],
    children: node.children.map((child) => cloneBranch(child)),
  } as T
}

export function cloneTree(nodes: WorkTreeNode[]): WorkTreeNode[] {
  return nodes.map((node) => cloneBranch(node))
}

export function cloneHistoryBranch(
  branch: HistoryRowSnapshot,
): HistoryRowSnapshot {
  return cloneBranch(branch)
}

export function makeEmptyHistory(
  present: WorkTreeNode[],
): WorkspaceHistoryState {
  return {
    version: HISTORY_VERSION,
    past: [],
    present: cloneTree(present),
    future: [],
  }
}

export function recordHistoryEntry(
  state: WorkspaceHistoryState,
  entry: HistoryEntry,
  present: WorkTreeNode[],
): WorkspaceHistoryState {
  return {
    version: HISTORY_VERSION,
    past: [...state.past, cloneHistoryEntry(entry)],
    present: cloneTree(present),
    future: [],
  }
}

function cloneHistoryEntry(entry: HistoryEntry): HistoryEntry {
  if (entry.type === "patch") {
    return {
      type: "patch",
      before: cloneHistoryBranch(entry.before),
      after: cloneHistoryBranch(entry.after),
    }
  }

  if (entry.type === "move") {
    return { ...entry }
  }

  return {
    ...entry,
    branch: cloneHistoryBranch(entry.branch),
  }
}

function remapBranchIds(
  branch: HistoryRowSnapshot,
  idMap: Record<string, string>,
  remappedParentId?: string | null,
): HistoryRowSnapshot {
  const nextId = idMap[branch.id] ?? branch.id
  const nextParentId =
    remappedParentId !== undefined
      ? remappedParentId
      : branch.parentId === null
        ? null
        : (idMap[branch.parentId] ?? branch.parentId)

  return {
    ...branch,
    id: nextId,
    parentId: nextParentId,
    children: branch.children.map((child) =>
      remapBranchIds(child, idMap, nextId),
    ),
  }
}

export function remapHistoryIds(
  state: WorkspaceHistoryState,
  idMap: Record<string, string>,
): WorkspaceHistoryState {
  if (Object.keys(idMap).length === 0) {
    return state
  }

  const remapEntry = (entry: HistoryEntry): HistoryEntry => {
    if (entry.type === "patch") {
      return {
        type: "patch",
        before: remapBranchIds(entry.before, idMap),
        after: remapBranchIds(entry.after, idMap),
      }
    }

    if (entry.type === "move") {
      return {
        ...entry,
        rowId: idMap[entry.rowId] ?? entry.rowId,
        fromParentId:
          entry.fromParentId === null
            ? null
            : (idMap[entry.fromParentId] ?? entry.fromParentId),
        toParentId:
          entry.toParentId === null
            ? null
            : (idMap[entry.toParentId] ?? entry.toParentId),
      }
    }

    return {
      ...entry,
      targetParentId:
        entry.targetParentId === null
          ? null
          : (idMap[entry.targetParentId] ?? entry.targetParentId),
      branch: remapBranchIds(entry.branch, idMap),
    }
  }

  return {
    version: HISTORY_VERSION,
    past: state.past.map(remapEntry),
    present: remapTreeIds(state.present, idMap),
    future: state.future.map(remapEntry),
  }
}

export function findBranch(
  nodes: WorkTreeNode[],
  rowId: string,
): WorkTreeNode | null {
  const queue = [...nodes]
  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) {
      continue
    }
    if (current.id === rowId) {
      return cloneBranch(current)
    }
    queue.push(...current.children)
  }
  return null
}

export function getRowPlacement(
  nodes: WorkTreeNode[],
  rowId: string,
): { parentId: string | null; index: number } | null {
  function visit(
    branch: WorkTreeNode[],
  ): { parentId: string | null; index: number } | null {
    for (const [index, node] of branch.entries()) {
      if (node.id === rowId) {
        return { parentId: node.parentId, index }
      }
      const nested = visit(node.children)
      if (nested) {
        return nested
      }
    }
    return null
  }

  return visit(nodes)
}

export function removeBranchFromTree(
  nodes: WorkTreeNode[],
  rowId: string,
): WorkTreeNode[] {
  const next = cloneTree(nodes)

  function visit(branch: WorkTreeNode[]): boolean {
    const index = branch.findIndex((node) => node.id === rowId)
    if (index >= 0) {
      branch.splice(index, 1)
      branch.forEach((node, siblingIndex) => {
        node.siblingOrder = siblingIndex
      })
      return true
    }

    for (const node of branch) {
      if (visit(node.children)) {
        return true
      }
    }

    return false
  }

  return visit(next) ? next : nodes
}

export function restoreBranchIntoTree(
  nodes: WorkTreeNode[],
  branch: HistoryRowSnapshot,
  targetParentId: string | null,
  targetIndex: number,
): WorkTreeNode[] {
  const next = cloneTree(nodes)
  const restored = cloneHistoryBranch(branch) as WorkTreeNode
  restored.parentId = targetParentId

  const bucket = getChildrenBucket(next, targetParentId)
  if (!bucket) {
    return nodes
  }

  const safeIndex = Math.max(0, Math.min(targetIndex, bucket.length))
  bucket.splice(safeIndex, 0, restored)
  bucket.forEach((node, index) => {
    node.parentId = targetParentId
    node.siblingOrder = index
  })
  return next
}

function getChildrenBucket(
  roots: WorkTreeNode[],
  parentId: string | null,
): WorkTreeNode[] | null {
  if (parentId === null) {
    return roots
  }

  const queue = [...roots]
  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) {
      continue
    }
    if (current.id === parentId) {
      return current.children
    }
    queue.push(...current.children)
  }

  return null
}

function remapTreeIds(
  nodes: WorkTreeNode[],
  idMap: Record<string, string>,
  remappedParentId?: string | null,
): WorkTreeNode[] {
  return nodes.map((node) => {
    const nextId = idMap[node.id] ?? node.id
    const nextParentId =
      remappedParentId !== undefined
        ? remappedParentId
        : node.parentId === null
          ? null
          : (idMap[node.parentId] ?? node.parentId)

    return {
      ...node,
      id: nextId,
      parentId: nextParentId,
      currentProblems: [...node.currentProblems],
      solutionVariants: [...node.solutionVariants],
      children: remapTreeIds(node.children, idMap, nextId),
    }
  })
}

function normalizeTree(nodes: WorkTreeNode[]): unknown {
  return nodes.map((node) => ({
    id: node.id,
    workspaceId: node.workspaceId,
    title: node.title,
    object: node.object,
    possiblyRemovable: node.possiblyRemovable,
    parentId: node.parentId,
    siblingOrder: node.siblingOrder,
    overcomplication: node.overcomplication,
    importance: node.importance,
    blocksMoney: node.blocksMoney,
    currentProblems: [...node.currentProblems],
    solutionVariants: [...node.solutionVariants],
    overcomplicationSum: node.overcomplicationSum ?? null,
    importanceSum: node.importanceSum ?? null,
    blocksMoneySum: node.blocksMoneySum ?? null,
    children: normalizeTree(node.children),
  }))
}

export function areTreesEquivalent(
  left: WorkTreeNode[],
  right: WorkTreeNode[],
): boolean {
  return (
    JSON.stringify(normalizeTree(left)) === JSON.stringify(normalizeTree(right))
  )
}

export function loadWorkspaceHistory(
  workspaceId: string,
): WorkspaceHistoryState | null {
  if (typeof window === "undefined") {
    return null
  }

  try {
    const raw = window.sessionStorage.getItem(`${STORAGE_PREFIX}${workspaceId}`)
    if (!raw) {
      return null
    }
    const parsed = JSON.parse(raw) as WorkspaceHistoryState | null
    if (
      !parsed ||
      parsed.version !== HISTORY_VERSION ||
      !Array.isArray(parsed.past) ||
      !Array.isArray(parsed.present) ||
      !Array.isArray(parsed.future)
    ) {
      return null
    }
    return {
      version: HISTORY_VERSION,
      past: parsed.past.map(cloneHistoryEntry),
      present: cloneTree(parsed.present),
      future: parsed.future.map(cloneHistoryEntry),
    }
  } catch {
    return null
  }
}

export function saveWorkspaceHistory(
  workspaceId: string,
  state: WorkspaceHistoryState,
) {
  if (typeof window === "undefined") {
    return
  }

  window.sessionStorage.setItem(
    `${STORAGE_PREFIX}${workspaceId}`,
    JSON.stringify({
      version: HISTORY_VERSION,
      past: state.past,
      present: state.present,
      future: state.future,
    }),
  )
}

export function clearWorkspaceHistory(workspaceId: string) {
  if (typeof window === "undefined") {
    return
  }

  window.sessionStorage.removeItem(`${STORAGE_PREFIX}${workspaceId}`)
}

export function isUndoRedoShortcut(
  event: KeyboardEvent,
): "undo" | "redo" | null {
  const isPrimary = event.metaKey || event.ctrlKey
  if (!isPrimary || event.altKey || event.key.toLowerCase() !== "z") {
    return null
  }
  return event.shiftKey ? "redo" : "undo"
}
