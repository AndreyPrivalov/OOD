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
  blocksMoney: number | null
  currentProblems: string[]
  solutionVariants: string[]
  createdAt?: Date
  updatedAt?: Date
}

export type SerializedWorkTreeNode = SerializedWorkItem & {
  overcomplicationSum: number
  importanceSum: number
  blocksMoneySum: number
  children: SerializedWorkTreeNode[]
}

type WorkItemContractInput = Partial<SerializedWorkItem> & {
  createdAt?: Date
  updatedAt?: Date
}

type WorkTreeContractInput = Partial<SerializedWorkTreeNode> & {
  children?: WorkTreeContractInput[]
}

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter((item): item is string => typeof item === "string")
}

function toNullableNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }
  return null
}

function toNumberOrZero(value: unknown): number {
  const parsed = toNullableNumber(value)
  return parsed ?? 0
}

export function serializeWorkItem(
  item: WorkItemContractInput,
): SerializedWorkItem {
  return {
    id: typeof item.id === "string" ? item.id : "",
    workspaceId: typeof item.workspaceId === "string" ? item.workspaceId : "",
    title: typeof item.title === "string" ? item.title : "",
    object:
      typeof item.object === "string" || item.object === null
        ? item.object
        : null,
    possiblyRemovable: item.possiblyRemovable === true,
    parentId: typeof item.parentId === "string" ? item.parentId : null,
    siblingOrder:
      typeof item.siblingOrder === "number" &&
      Number.isFinite(item.siblingOrder)
        ? item.siblingOrder
        : 0,
    overcomplication: toNullableNumber(item.overcomplication),
    importance: toNullableNumber(item.importance),
    blocksMoney: toNullableNumber(item.blocksMoney),
    currentProblems: toStringList(item.currentProblems),
    solutionVariants: toStringList(item.solutionVariants),
    ...(item.createdAt instanceof Date ? { createdAt: item.createdAt } : {}),
    ...(item.updatedAt instanceof Date ? { updatedAt: item.updatedAt } : {}),
  }
}

export function serializeWorkTreeNode(
  item: WorkTreeContractInput,
): SerializedWorkTreeNode {
  const children = Array.isArray(item.children)
    ? item.children.map(serializeWorkTreeNode)
    : []

  return {
    ...serializeWorkItem(item),
    overcomplicationSum: toNumberOrZero(item.overcomplicationSum),
    importanceSum: toNumberOrZero(item.importanceSum),
    blocksMoneySum: toNumberOrZero(item.blocksMoneySum),
    children,
  }
}

export function serializeWorkTree(
  tree: ReadonlyArray<WorkTreeContractInput>,
): SerializedWorkTreeNode[] {
  return tree.map(serializeWorkTreeNode)
}
