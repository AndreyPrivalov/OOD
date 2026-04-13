import type { WorkItemErrorPayload } from "../work-item-client"

export type WorkTreeNode = {
  id: string
  workspaceId: string
  title: string
  object: string | null
  possiblyRemovable: boolean
  parentId: string | null
  siblingOrder: number
  overcomplication: number | null
  importance: number | null
  blocksMoney: number | null
  currentProblems: string[]
  solutionVariants: string[]
  overcomplicationSum?: number
  importanceSum?: number
  blocksMoneySum?: number
  children: WorkTreeNode[]
}

export type FlatRow = WorkTreeNode & { depth: number }

const DEFAULT_WORKSPACE_ID = "default-workspace"

const ERROR_TEXT_BY_CODE: Record<string, string> = {
  INVALID_PAYLOAD: "Некорректные данные в запросе.",
  INVALID_NUMERIC_RANGE: "Оценка должна быть целым числом от 0 до 5.",
  EMPTY_TITLE: "Заголовок не может быть пустым.",
  PARENT_NOT_FOUND: "Указанный родитель не найден.",
  CYCLE_DETECTED: "Нельзя переместить задачу внутрь собственной ветки.",
  INVALID_MOVE_TARGET: "Некорректная цель перемещения.",
  PARENT_RATINGS_READ_ONLY: "У родительской работы оценки только для чтения.",
  INTERNAL_ERROR: "Внутренняя ошибка сервера.",
}

export function flattenTree(nodes: WorkTreeNode[], depth = 0): FlatRow[] {
  const result: FlatRow[] = []
  for (const node of nodes) {
    result.push({ ...node, depth })
    result.push(...flattenTree(node.children, depth + 1))
  }
  return result
}

export function buildTreeNumbering(
  nodes: WorkTreeNode[],
  prefix: number[] = [],
) {
  const map = new Map<string, string>()
  const sorted = [...nodes].sort((a, b) => a.siblingOrder - b.siblingOrder)
  sorted.forEach((node, index) => {
    const path = [...prefix, index + 1]
    map.set(node.id, path.join("."))
    const childMap = buildTreeNumbering(node.children, path)
    for (const [childId, value] of childMap.entries()) {
      map.set(childId, value)
    }
  })
  return map
}

export function mapWorkItemErrorText(
  payload: WorkItemErrorPayload | null | undefined,
) {
  if (payload?.error && ERROR_TEXT_BY_CODE[payload.error]) {
    return ERROR_TEXT_BY_CODE[payload.error]
  }
  if (payload?.message && ERROR_TEXT_BY_CODE[payload.message]) {
    return ERROR_TEXT_BY_CODE[payload.message]
  }
  if (payload?.message && payload.message.trim().length > 0) {
    return payload.message
  }
  return "Не удалось выполнить действие. Повторите попытку."
}

export function normalizeTreeData(input: unknown): WorkTreeNode[] {
  if (!Array.isArray(input)) {
    return []
  }
  const raw = input as Array<Partial<WorkTreeNode>>
  const hasNestedChildren = raw.some(
    (node) => Array.isArray(node.children) && node.children.length > 0,
  )
  if (hasNestedChildren) {
    return raw as WorkTreeNode[]
  }

  const byId = new Map<string, WorkTreeNode>()
  for (const row of raw) {
    if (!row || typeof row.id !== "string") continue
    byId.set(row.id, {
      id: row.id,
      workspaceId: row.workspaceId ?? DEFAULT_WORKSPACE_ID,
      title: row.title ?? "",
      object: row.object ?? null,
      possiblyRemovable: row.possiblyRemovable ?? false,
      parentId: row.parentId ?? null,
      siblingOrder: row.siblingOrder ?? 0,
      overcomplication: row.overcomplication ?? null,
      importance: row.importance ?? null,
      blocksMoney: row.blocksMoney ?? null,
      currentProblems: Array.isArray(row.currentProblems)
        ? row.currentProblems
        : [],
      solutionVariants: Array.isArray(row.solutionVariants)
        ? row.solutionVariants
        : [],
      overcomplicationSum: row.overcomplicationSum,
      importanceSum: row.importanceSum,
      blocksMoneySum: row.blocksMoneySum,
      children: [],
    })
  }

  const roots: WorkTreeNode[] = []
  for (const node of byId.values()) {
    if (!node.parentId || !byId.has(node.parentId)) {
      roots.push(node)
      continue
    }
    byId.get(node.parentId)?.children.push(node)
  }

  const sortRecursively = (nodes: WorkTreeNode[]) => {
    nodes.sort((a, b) => a.siblingOrder - b.siblingOrder)
    for (const node of nodes) {
      sortRecursively(node.children)
    }
  }
  sortRecursively(roots)
  return roots
}

export function patchTreeRow(
  nodes: WorkTreeNode[],
  rowId: string,
  patch: Partial<WorkTreeNode>,
): WorkTreeNode[] {
  let changed = false
  const nextNodes = nodes.map((node) => {
    if (node.id === rowId) {
      changed = true
      return { ...node, ...patch }
    }
    const nextChildren = patchTreeRow(node.children, rowId, patch)
    if (nextChildren !== node.children) {
      changed = true
      return { ...node, children: nextChildren }
    }
    return node
  })
  return changed ? nextNodes : nodes
}

function cloneTree(nodes: WorkTreeNode[]): WorkTreeNode[] {
  return nodes.map((node) => ({
    ...node,
    children: cloneTree(node.children),
  }))
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
    if (!current) continue
    if (current.id === parentId) {
      return current.children
    }
    queue.push(...current.children)
  }
  return null
}

function resequenceSiblings(nodes: WorkTreeNode[]) {
  nodes.forEach((node, index) => {
    node.siblingOrder = index
  })
}

function detachNode(
  nodes: WorkTreeNode[],
  id: string,
): { node: WorkTreeNode; sourceSiblings: WorkTreeNode[] } | null {
  const index = nodes.findIndex((node) => node.id === id)
  if (index >= 0) {
    const [node] = nodes.splice(index, 1)
    return { node, sourceSiblings: nodes }
  }

  for (const node of nodes) {
    const found = detachNode(node.children, id)
    if (found) {
      return found
    }
  }
  return null
}

function makeOptimisticNode(input: Partial<WorkTreeNode>): WorkTreeNode | null {
  if (typeof input.id !== "string" || input.id.length === 0) {
    return null
  }
  return {
    id: input.id,
    workspaceId: input.workspaceId ?? DEFAULT_WORKSPACE_ID,
    title: input.title ?? "",
    object: input.object ?? null,
    possiblyRemovable: input.possiblyRemovable ?? false,
    parentId: input.parentId ?? null,
    siblingOrder: input.siblingOrder ?? 0,
    overcomplication: input.overcomplication ?? null,
    importance: input.importance ?? null,
    blocksMoney: input.blocksMoney ?? null,
    currentProblems: Array.isArray(input.currentProblems)
      ? input.currentProblems
      : [],
    solutionVariants: Array.isArray(input.solutionVariants)
      ? input.solutionVariants
      : [],
    overcomplicationSum: input.overcomplicationSum,
    importanceSum: input.importanceSum,
    blocksMoneySum: input.blocksMoneySum,
    children: [],
  }
}

export function applyOptimisticCreate(
  currentTree: WorkTreeNode[],
  created: Partial<WorkTreeNode>,
  parentId: string | null,
  targetIndex: number,
): WorkTreeNode[] {
  const optimisticNode = makeOptimisticNode(created)
  if (!optimisticNode) {
    return currentTree
  }

  const nextTree = cloneTree(currentTree)
  const siblings = getChildrenBucket(nextTree, parentId)
  if (!siblings) {
    return currentTree
  }

  const safeIndex = Math.max(0, Math.min(targetIndex, siblings.length))
  optimisticNode.parentId = parentId
  siblings.splice(safeIndex, 0, optimisticNode)
  resequenceSiblings(siblings)
  return nextTree
}

export function applyOptimisticMove(
  currentTree: WorkTreeNode[],
  id: string,
  targetParentId: string | null,
  targetIndex: number,
): WorkTreeNode[] {
  const nextTree = cloneTree(currentTree)
  const detached = detachNode(nextTree, id)
  if (!detached) {
    return currentTree
  }

  const destinationSiblings = getChildrenBucket(nextTree, targetParentId)
  if (!destinationSiblings) {
    return currentTree
  }

  const safeIndex = Math.max(
    0,
    Math.min(targetIndex, destinationSiblings.length),
  )
  detached.node.parentId = targetParentId
  destinationSiblings.splice(safeIndex, 0, detached.node)
  resequenceSiblings(detached.sourceSiblings)
  resequenceSiblings(destinationSiblings)
  return nextTree
}
