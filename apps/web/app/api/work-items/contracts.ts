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
  | "blocksMoney"
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
  | "blocksMoney"
  | "currentProblems"
  | "solutionVariants"
  | "createdAt"
  | "updatedAt"
  | "overcomplicationSum"
  | "importanceSum"
  | "blocksMoneySum"
  | "children"
>

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
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }
}

export function serializeWorkTreeNode(
  item: WorkTreeContractInput,
): SerializedWorkTreeNode {
  return {
    ...serializeWorkItem(item),
    overcomplicationSum: item.overcomplicationSum,
    importanceSum: item.importanceSum,
    blocksMoneySum: item.blocksMoneySum,
    children: item.children.map(serializeWorkTreeNode),
  }
}

export function serializeWorkTree(
  tree: ReadonlyArray<WorkTreeContractInput>,
): SerializedWorkTreeNode[] {
  return tree.map(serializeWorkTreeNode)
}

export function serializeRestoreWorkTreeNode(
  item: WorkTreeContractInput,
): SerializedRestoreWorkTreeNode {
  return {
    ...serializeWorkItem(item),
    children: item.children.map(serializeRestoreWorkTreeNode),
  }
}
