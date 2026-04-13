import { randomUUID } from "node:crypto"
import {
  type CreateWorkItemInput,
  DomainError,
  DomainErrorCode,
  type MoveWorkItemInput,
  type UpdateWorkItemInput,
  type WorkItem,
  type WorkTreeReadNode,
  type Workspace,
  type WorkspaceId,
  assertNoCycle,
  buildTree,
  validateCreateWorkItemInput,
  withScoreSums,
} from "@ood/domain"
import type { WorkItemRepository } from "./repository"
import type {
  CreateWorkspaceInput,
  WorkspaceRepository,
} from "./workspace-repository"
import { DEFAULT_WORKSPACE_ID, DEFAULT_WORKSPACE_NAME } from "./workspace-store"

type InMemoryStore = {
  byWorkspace: Map<WorkspaceId, WorkItem[]>
  workspaces: Map<WorkspaceId, Workspace>
}

const memoryStore: InMemoryStore = {
  byWorkspace: new Map(),
  workspaces: new Map(),
}

function clampIndex(index: number, maxLength: number): number {
  if (index < 0) return 0
  if (index > maxLength) return maxLength
  return index
}

function hasRatingUpdate(patch: UpdateWorkItemInput): boolean {
  return (
    patch.overcomplication !== undefined ||
    patch.importance !== undefined ||
    patch.blocksMoney !== undefined
  )
}

function getWorkspaceItems(workspaceId: WorkspaceId): WorkItem[] {
  ensureWorkspace(workspaceId)
  const items = memoryStore.byWorkspace.get(workspaceId)
  if (items) {
    return items
  }
  const created: WorkItem[] = []
  memoryStore.byWorkspace.set(workspaceId, created)
  return created
}

function findItemById(id: string): WorkItem | undefined {
  for (const items of memoryStore.byWorkspace.values()) {
    const found = items.find((item) => item.id === id)
    if (found) {
      return found
    }
  }
  return undefined
}

function ensureWorkspace(
  workspaceId: WorkspaceId,
  name = DEFAULT_WORKSPACE_NAME,
): Workspace {
  const existing = memoryStore.workspaces.get(workspaceId)
  if (existing) {
    return existing
  }

  const now = new Date()
  const created: Workspace = {
    id: workspaceId,
    name,
    createdAt: now,
    updatedAt: now,
  }
  memoryStore.workspaces.set(workspaceId, created)
  return created
}

function descendantsFor(items: WorkItem[]): Map<string, Set<string>> {
  const byParent = new Map<string | null, string[]>()
  for (const item of items) {
    const current = byParent.get(item.parentId) ?? []
    current.push(item.id)
    byParent.set(item.parentId, current)
  }
  const result = new Map<string, Set<string>>()
  for (const item of items) {
    const visited = new Set<string>()
    const stack = [...(byParent.get(item.id) ?? [])]
    while (stack.length > 0) {
      const next = stack.pop()
      if (!next || visited.has(next)) continue
      visited.add(next)
      for (const child of byParent.get(next) ?? []) {
        stack.push(child)
      }
    }
    result.set(item.id, visited)
  }
  return result
}

export class InMemoryWorkItemRepository implements WorkItemRepository {
  async listTree(workspaceId: WorkspaceId): Promise<WorkTreeReadNode[]> {
    const items = getWorkspaceItems(workspaceId)
    return withScoreSums(
      buildTree(
        items
          .map((item) => ({ ...item }))
          .sort((a, b) => a.siblingOrder - b.siblingOrder),
      ),
    )
  }

  async create(input: CreateWorkItemInput): Promise<WorkItem> {
    const validatedInput = validateCreateWorkItemInput(input)
    const workspaceItems = getWorkspaceItems(validatedInput.workspaceId)
    if (validatedInput.parentId) {
      const parent = workspaceItems.find(
        (item) => item.id === validatedInput.parentId,
      )
      if (!parent) {
        throw new DomainError(
          DomainErrorCode.PARENT_NOT_FOUND,
          "Parent was not found in current workspace",
        )
      }
    }
    const id = randomUUID()
    const siblings = workspaceItems
      .filter((item) => item.parentId === (validatedInput.parentId ?? null))
      .sort((a, b) => a.siblingOrder - b.siblingOrder)
    const insertIndex = clampIndex(
      validatedInput.siblingOrder ?? siblings.length,
      siblings.length,
    )
    const siblingIds = siblings.map((item) => item.id)
    siblingIds.splice(insertIndex, 0, id)
    for (const [index, siblingId] of siblingIds.entries()) {
      const item = workspaceItems.find((row) => row.id === siblingId)
      if (item) item.siblingOrder = index
    }
    const now = new Date()
    const created: WorkItem = {
      id,
      workspaceId: validatedInput.workspaceId,
      title: validatedInput.title,
      object: validatedInput.object ?? null,
      possiblyRemovable: validatedInput.possiblyRemovable ?? false,
      parentId: validatedInput.parentId ?? null,
      siblingOrder: insertIndex,
      overcomplication:
        (validatedInput.overcomplication as WorkItem["overcomplication"]) ??
        null,
      importance: (validatedInput.importance as WorkItem["importance"]) ?? null,
      blocksMoney:
        (validatedInput.blocksMoney as WorkItem["blocksMoney"]) ?? null,
      currentProblems: validatedInput.currentProblems ?? [],
      solutionVariants: validatedInput.solutionVariants ?? [],
      createdAt: now,
      updatedAt: now,
    }
    workspaceItems.push(created)
    return { ...created }
  }

  async update(id: string, patch: UpdateWorkItemInput): Promise<WorkItem> {
    const item = findItemById(id)
    if (!item) {
      throw new DomainError(
        DomainErrorCode.INVALID_MOVE_TARGET,
        "Work item not found",
      )
    }
    if (hasRatingUpdate(patch)) {
      const workspaceItems = getWorkspaceItems(item.workspaceId)
      const hasChildren = workspaceItems.some((row) => row.parentId === id)
      if (hasChildren) {
        throw new DomainError(
          DomainErrorCode.PARENT_RATINGS_READ_ONLY,
          "Ratings are read-only for items with child work items",
        )
      }
    }
    if (patch.title !== undefined) item.title = patch.title
    if (patch.object !== undefined) item.object = patch.object
    if (patch.possiblyRemovable !== undefined) {
      item.possiblyRemovable = patch.possiblyRemovable
    }
    if (patch.overcomplication !== undefined) {
      item.overcomplication =
        patch.overcomplication as WorkItem["overcomplication"]
    }
    if (patch.importance !== undefined) {
      item.importance = patch.importance as WorkItem["importance"]
    }
    if (patch.blocksMoney !== undefined) {
      item.blocksMoney = patch.blocksMoney as WorkItem["blocksMoney"]
    }
    if (patch.currentProblems !== undefined)
      item.currentProblems = patch.currentProblems
    if (patch.solutionVariants !== undefined)
      item.solutionVariants = patch.solutionVariants
    item.updatedAt = new Date()
    return { ...item }
  }

  async move(id: string, input: MoveWorkItemInput): Promise<void> {
    const item = findItemById(id)
    if (!item) {
      throw new DomainError(
        DomainErrorCode.INVALID_MOVE_TARGET,
        "Moving work item not found",
      )
    }
    const workspaceItems = getWorkspaceItems(item.workspaceId)
    if (input.targetParentId) {
      const targetParent = workspaceItems.find(
        (row) => row.id === input.targetParentId,
      )
      if (!targetParent) {
        throw new DomainError(
          DomainErrorCode.PARENT_NOT_FOUND,
          "Target parent not found",
        )
      }
      const descendants = descendantsFor(workspaceItems)
      assertNoCycle(id, input.targetParentId, descendants)
    }

    const oldParent = item.parentId
    const targetParentId = input.targetParentId
    const oldSiblings = workspaceItems
      .filter((row) => row.parentId === oldParent && row.id !== id)
      .sort((a, b) => a.siblingOrder - b.siblingOrder)
    oldSiblings.forEach((row, index) => {
      row.siblingOrder = index
    })

    const newSiblings = workspaceItems
      .filter((row) => row.parentId === targetParentId && row.id !== id)
      .sort((a, b) => a.siblingOrder - b.siblingOrder)
    const targetIndex = clampIndex(input.targetIndex, newSiblings.length)
    newSiblings.splice(targetIndex, 0, item)
    item.parentId = targetParentId
    newSiblings.forEach((row, index) => {
      row.siblingOrder = index
    })
  }

  async deleteCascade(id: string): Promise<void> {
    const item = findItemById(id)
    if (!item) {
      return
    }
    const workspaceItems = getWorkspaceItems(item.workspaceId)
    const descendants = descendantsFor(workspaceItems)
    const toDelete = new Set<string>([id, ...(descendants.get(id) ?? [])])
    const kept = workspaceItems.filter((row) => !toDelete.has(row.id))
    memoryStore.byWorkspace.set(item.workspaceId, kept)
    const siblings = kept
      .filter((row) => row.parentId === item.parentId)
      .sort((a, b) => a.siblingOrder - b.siblingOrder)
    siblings.forEach((row, index) => {
      row.siblingOrder = index
    })
  }
}

export class InMemoryWorkspaceRepository implements WorkspaceRepository {
  async list(): Promise<Workspace[]> {
    ensureWorkspace(DEFAULT_WORKSPACE_ID)
    return Array.from(memoryStore.workspaces.values()).sort(
      (left, right) =>
        left.createdAt.getTime() - right.createdAt.getTime() ||
        left.id.localeCompare(right.id),
    )
  }

  async create(input: CreateWorkspaceInput): Promise<Workspace> {
    const workspace = ensureWorkspace(randomUUID(), input.name)
    return { ...workspace }
  }
}

export function __resetInMemoryStoreForTests() {
  memoryStore.byWorkspace.clear()
  memoryStore.workspaces.clear()
}
