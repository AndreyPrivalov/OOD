import type {
  WorkItem,
  WorkItemMetricValues,
  WorkTreeReadNode,
  WorkspaceMetricValue,
} from "@ood/domain"

const metricPriority: Record<WorkspaceMetricValue, number> = {
  none: 0,
  indirect: 1,
  direct: 2,
}

function sanitizeMetricValues(
  values: WorkItemMetricValues | undefined,
): WorkItemMetricValues {
  if (!values) {
    return {}
  }
  const next: WorkItemMetricValues = {}
  for (const [metricId, value] of Object.entries(values)) {
    if (value === "none" || value === "indirect" || value === "direct") {
      next[metricId] = value
    }
  }
  return next
}

function toExplicitAggregateMap(
  values: WorkItemMetricValues,
  metricIds: readonly string[],
): WorkItemMetricValues {
  const next: WorkItemMetricValues = {}
  for (const metricId of metricIds) {
    next[metricId] = values[metricId] ?? "none"
  }
  return next
}

function aggregateMetricValue(
  values: WorkspaceMetricValue[],
): WorkspaceMetricValue {
  let best: WorkspaceMetricValue = "none"
  for (const value of values) {
    if (metricPriority[value] > metricPriority[best]) {
      best = value
    }
    if (best === "direct") {
      return best
    }
  }
  return best
}

export type SerializedWorkItem = {
  id: string
  workspaceId: string
  title: string
  object: string | null
  possiblyRemovable: boolean
  parentId: string | null
  siblingOrder: number
  overcomplication: number | null
  importance: number | null
  metricValues: WorkItemMetricValues
  metricAggregates: WorkItemMetricValues
  currentProblems: string[]
  solutionVariants: string[]
  createdAt?: Date
  updatedAt?: Date
}

export type SerializedWorkTreeNode = SerializedWorkItem & {
  overcomplicationSum: number
  importanceSum: number
  children: SerializedWorkTreeNode[]
}

export type SerializedRestoreWorkTreeNode = SerializedWorkItem & {
  children: SerializedRestoreWorkTreeNode[]
}

type WorkItemContractInput = Pick<
  WorkItem,
  | "id"
  | "workspaceId"
  | "title"
  | "object"
  | "possiblyRemovable"
  | "parentId"
  | "siblingOrder"
  | "overcomplication"
  | "importance"
  | "currentProblems"
  | "solutionVariants"
  | "createdAt"
  | "updatedAt"
>

type WorkTreeContractInput = Pick<
  WorkTreeReadNode,
  | "id"
  | "workspaceId"
  | "title"
  | "object"
  | "possiblyRemovable"
  | "parentId"
  | "siblingOrder"
  | "overcomplication"
  | "importance"
  | "currentProblems"
  | "solutionVariants"
  | "createdAt"
  | "updatedAt"
  | "overcomplicationSum"
  | "importanceSum"
  | "children"
>

export function serializeWorkItem(
  item: WorkItemContractInput,
  metricValues?: WorkItemMetricValues,
  metricAggregates?: WorkItemMetricValues,
): SerializedWorkItem {
  const sanitizedMetricValues = sanitizeMetricValues(metricValues)
  const sanitizedMetricAggregates = sanitizeMetricValues(metricAggregates)
  return {
    id: item.id,
    workspaceId: item.workspaceId,
    title: item.title,
    object: item.object,
    possiblyRemovable: item.possiblyRemovable,
    parentId: item.parentId,
    siblingOrder: item.siblingOrder,
    overcomplication: item.overcomplication,
    importance: item.importance,
    metricValues: sanitizedMetricValues,
    metricAggregates: sanitizedMetricAggregates,
    currentProblems: item.currentProblems,
    solutionVariants: item.solutionVariants,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }
}

export function serializeWorkTreeNode(
  item: WorkTreeContractInput,
  options?: {
    metricIds?: readonly string[]
    metricValuesByItemId?: ReadonlyMap<string, WorkItemMetricValues>
  },
): SerializedWorkTreeNode {
  const metricIds = options?.metricIds ?? []
  const ownValues = sanitizeMetricValues(
    options?.metricValuesByItemId?.get(item.id) ?? {},
  )

  const childNodes = item.children.map((child) =>
    serializeWorkTreeNode(child, options),
  )

  const metricAggregates =
    childNodes.length === 0
      ? toExplicitAggregateMap(ownValues, metricIds)
      : toExplicitAggregateMap(
          Object.fromEntries(
            metricIds.map((metricId) => {
              const value = aggregateMetricValue(
                childNodes.map(
                  (childNode) => childNode.metricAggregates[metricId] ?? "none",
                ),
              )
              return [metricId, value]
            }),
          ) as WorkItemMetricValues,
          metricIds,
        )

  return {
    ...serializeWorkItem(item, ownValues, metricAggregates),
    overcomplicationSum: item.overcomplicationSum,
    importanceSum: item.importanceSum,
    children: childNodes,
  }
}

export function serializeWorkTree(
  tree: ReadonlyArray<WorkTreeContractInput>,
  options?: {
    metricIds?: readonly string[]
    metricValuesByItemId?: ReadonlyMap<string, WorkItemMetricValues>
  },
): SerializedWorkTreeNode[] {
  return tree.map((item) => serializeWorkTreeNode(item, options))
}

export function serializeRestoreWorkTreeNode(
  item: WorkTreeContractInput,
): SerializedRestoreWorkTreeNode {
  return {
    ...serializeWorkItem(item),
    children: item.children.map(serializeRestoreWorkTreeNode),
  }
}
