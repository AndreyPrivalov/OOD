import { addRatingTotals, emptyRatingTotals } from "@ood/domain"
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
  metricValues?: Record<string, "none" | "indirect" | "direct">
  metricAggregates?: Record<string, "none" | "indirect" | "direct">
  currentProblems: string[]
  solutionVariants: string[]
  overcomplicationSum?: number
  importanceSum?: number
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

function isStringArray(input: unknown): input is string[] {
  return Array.isArray(input) && input.every((item) => typeof item === "string")
}

function isMetricValue(
  input: unknown,
): input is "none" | "indirect" | "direct" {
  return input === "none" || input === "indirect" || input === "direct"
}

function isMetricValueMap(
  input: unknown,
): input is Record<string, "none" | "indirect" | "direct"> {
  if (!input || typeof input !== "object") {
    return false
  }
  return Object.values(input).every(isMetricValue)
}

function resolveMetricAggregateValue(
  values: Array<"none" | "indirect" | "direct">,
) {
  let nextValue: "none" | "indirect" | "direct" = "none"
  for (const value of values) {
    if (value === "direct") {
      return "direct"
    }
    if (value === "indirect") {
      nextValue = "indirect"
    }
  }
  return nextValue
}

function isWorkTreeNode(input: unknown): input is WorkTreeNode {
  if (!input || typeof input !== "object") {
    return false
  }
  const node = input as Partial<WorkTreeNode>
  return (
    typeof node.id === "string" &&
    typeof node.workspaceId === "string" &&
    typeof node.title === "string" &&
    (typeof node.object === "string" || node.object === null) &&
    typeof node.possiblyRemovable === "boolean" &&
    (typeof node.parentId === "string" || node.parentId === null) &&
    typeof node.siblingOrder === "number" &&
    Number.isFinite(node.siblingOrder) &&
    (typeof node.overcomplication === "number" ||
      node.overcomplication === null) &&
    (typeof node.importance === "number" || node.importance === null) &&
    (node.metricValues === undefined || isMetricValueMap(node.metricValues)) &&
    (node.metricAggregates === undefined ||
      isMetricValueMap(node.metricAggregates)) &&
    isStringArray(node.currentProblems) &&
    isStringArray(node.solutionVariants) &&
    (typeof node.overcomplicationSum === "number" ||
      node.overcomplicationSum === undefined) &&
    (typeof node.importanceSum === "number" ||
      node.importanceSum === undefined) &&
    Array.isArray(node.children) &&
    node.children.every(isWorkTreeNode)
  )
}

export function normalizeTreeData(input: unknown): WorkTreeNode[] {
  if (!Array.isArray(input)) {
    return []
  }
  if (!input.every(isWorkTreeNode)) {
    return []
  }
  return input.map(normalizeNodeMetrics)
}

function normalizeNodeMetrics(node: WorkTreeNode): WorkTreeNode {
  const normalizedChildren = node.children.map(normalizeNodeMetrics)
  return withDerivedMetricAggregates({
    ...node,
    metricValues: node.metricValues ?? {},
    metricAggregates: node.metricAggregates ?? {},
    children: normalizedChildren,
  })
}

function withDerivedMetricAggregates(node: WorkTreeNode): WorkTreeNode {
  if (node.children.length === 0) {
    const ownMetricValues: WorkTreeNode["metricValues"] = {}
    const ownMetricAggregates: WorkTreeNode["metricAggregates"] = {}
    const metricIds = new Set<string>([
      ...Object.keys(node.metricValues ?? {}),
      ...Object.keys(node.metricAggregates ?? {}),
    ])
    for (const metricId of metricIds) {
      const value = node.metricValues?.[metricId] ?? "none"
      if (value !== "none") {
        ownMetricValues[metricId] = value
      }
      ownMetricAggregates[metricId] = value
    }
    return {
      ...node,
      metricValues: ownMetricValues,
      metricAggregates: ownMetricAggregates,
    }
  }

  const metricIds = new Set<string>([
    ...Object.keys(node.metricValues ?? {}),
    ...Object.keys(node.metricAggregates ?? {}),
  ])
  for (const child of node.children) {
    for (const metricId of Object.keys(child.metricAggregates ?? {})) {
      metricIds.add(metricId)
    }
  }

  const derivedMetricAggregates: WorkTreeNode["metricAggregates"] = {}
  for (const metricId of metricIds) {
    derivedMetricAggregates[metricId] = resolveMetricAggregateValue(
      node.children.map(
        (child) => child.metricAggregates?.[metricId] ?? "none",
      ),
    )
  }

  return {
    ...node,
    metricAggregates: derivedMetricAggregates,
  }
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
      return withDerivedMetricAggregates(
        withDerivedRatingTotals({ ...node, ...patch }),
      )
    }
    const nextChildren = patchTreeRow(node.children, rowId, patch)
    if (nextChildren !== node.children) {
      changed = true
      return withDerivedMetricAggregates(
        withDerivedRatingTotals({ ...node, children: nextChildren }),
      )
    }
    return node
  })
  return changed ? nextNodes : nodes
}

function withDerivedRatingTotals(node: WorkTreeNode): WorkTreeNode {
  if (node.children.length === 0) {
    return {
      ...node,
      ...leafRatingTotalsFromNode(node),
    }
  }

  let aggregated = emptyRatingTotals()
  for (const child of node.children) {
    aggregated = addRatingTotals(aggregated, getNodeRatingTotals(child))
  }

  return {
    ...node,
    ...aggregated,
  }
}

function getNodeRatingTotals(node: WorkTreeNode) {
  if (node.children.length === 0) {
    return leafRatingTotalsFromNode(node)
  }

  if (
    typeof node.overcomplicationSum === "number" &&
    typeof node.importanceSum === "number"
  ) {
    return {
      overcomplicationSum: node.overcomplicationSum,
      importanceSum: node.importanceSum,
    }
  }

  let aggregated = emptyRatingTotals()
  for (const child of node.children) {
    aggregated = addRatingTotals(aggregated, getNodeRatingTotals(child))
  }
  return aggregated
}

function leafRatingTotalsFromNode(node: WorkTreeNode) {
  return {
    overcomplicationSum: node.overcomplication ?? 0,
    importanceSum: node.importance ?? 0,
  }
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
    metricValues:
      input.metricValues && typeof input.metricValues === "object"
        ? input.metricValues
        : {},
    metricAggregates:
      input.metricAggregates && typeof input.metricAggregates === "object"
        ? input.metricAggregates
        : {},
    currentProblems: Array.isArray(input.currentProblems)
      ? input.currentProblems
      : [],
    solutionVariants: Array.isArray(input.solutionVariants)
      ? input.solutionVariants
      : [],
    overcomplicationSum: input.overcomplicationSum,
    importanceSum: input.importanceSum,
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
