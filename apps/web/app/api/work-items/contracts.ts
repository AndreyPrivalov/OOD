import type { WorkItem, WorkTreeReadNode } from "@ood/domain"

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

type WorkItemContractInput = Omit<WorkItem, "createdAt" | "updatedAt"> & {
  createdAt?: Date
  updatedAt?: Date
}

type WorkTreeContractInput = Omit<WorkTreeReadNode, "createdAt" | "updatedAt">

export function serializeWorkItem(
  item: WorkItemContractInput,
): SerializedWorkItem {
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
    blocksMoney: item.blocksMoney,
    currentProblems: item.currentProblems,
    solutionVariants: item.solutionVariants,
    ...(item.createdAt instanceof Date ? { createdAt: item.createdAt } : {}),
    ...(item.updatedAt instanceof Date ? { updatedAt: item.updatedAt } : {}),
  }
}

export function serializeWorkTreeNode(
  item: WorkTreeContractInput,
): SerializedWorkTreeNode {
  const children = item.children.map(serializeWorkTreeNode)

  return {
    ...serializeWorkItem(item),
    overcomplicationSum: item.overcomplicationSum,
    importanceSum: item.importanceSum,
    blocksMoneySum: item.blocksMoneySum,
    children,
  }
}

export function serializeWorkTree(
  tree: ReadonlyArray<WorkTreeContractInput>,
): SerializedWorkTreeNode[] {
  return tree.map(serializeWorkTreeNode)
}
