import { randomUUID } from "node:crypto"
import {
  type CreateWorkItemInput,
  DomainError,
  DomainErrorCode,
  type MoveWorkItemInput,
  type RestoreWorkItemBranchInput,
  type UpdateWorkItemInput,
  type WorkItem,
  type WorkItemMetricValueEntry,
  type WorkTreeReadNode,
  type Workspace,
  type WorkspaceId,
  type WorkspaceMetric,
  type WorkspaceMetricValue,
  assertNoCycle,
  buildTree,
  validateCreateWorkItemInput,
  validateUpsertWorkspaceMetricInput,
  withScoreSums,
} from "@ood/domain"
import type { WorkItemRepository } from "./repository"
import type {
  CreateWorkspaceMetricInput,
  DeletedWorkspaceMetricSnapshot,
  RestoreWorkspaceMetricInput,
  SetWorkItemMetricValueInput,
  UpdateWorkspaceMetricInput,
  WorkspaceMetricRepository,
} from "./workspace-metric-repository"
import type {
  CreateWorkspaceInput,
  RenameWorkspaceInput,
  WorkspaceRepository,
} from "./workspace-repository"
import { DEFAULT_WORKSPACE_ID, DEFAULT_WORKSPACE_NAME } from "./workspace-store"

type InMemoryStore = {
  byWorkspace: Map<WorkspaceId, WorkItem[]>
  workspaces: Map<WorkspaceId, Workspace>
  metricsByWorkspace: Map<WorkspaceId, WorkspaceMetric[]>
  metricValuesByWorkItem: Map<string, Map<string, WorkspaceMetricValue>>
}

const memoryStore: InMemoryStore = {
  byWorkspace: new Map(),
  workspaces: new Map(),
  metricsByWorkspace: new Map(),
  metricValuesByWorkItem: new Map(),
}

function clampIndex(index: number, maxLength: number): number {
  if (index < 0) return 0
  if (index > maxLength) return maxLength
  return index
}

function hasRatingUpdate(patch: UpdateWorkItemInput): boolean {
  return patch.overcomplication !== undefined || patch.importance !== undefined
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
  if (!memoryStore.metricsByWorkspace.has(workspaceId)) {
    memoryStore.metricsByWorkspace.set(workspaceId, [])
  }
  return created
}

function getWorkspaceMetrics(workspaceId: WorkspaceId): WorkspaceMetric[] {
  ensureWorkspace(workspaceId)
  const metrics = memoryStore.metricsByWorkspace.get(workspaceId)
  if (metrics) {
    return metrics
  }
  const created: WorkspaceMetric[] = []
  memoryStore.metricsByWorkspace.set(workspaceId, created)
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

function flattenRestoreIds(root: RestoreWorkItemBranchInput["root"]) {
  const ids: string[] = []
  const queue = [root]
  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) {
      continue
    }
    ids.push(current.id)
    queue.push(...current.children)
  }
  return ids
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
    for (const itemId of toDelete) {
      memoryStore.metricValuesByWorkItem.delete(itemId)
    }
    const kept = workspaceItems.filter((row) => !toDelete.has(row.id))
    memoryStore.byWorkspace.set(item.workspaceId, kept)
    const siblings = kept
      .filter((row) => row.parentId === item.parentId)
      .sort((a, b) => a.siblingOrder - b.siblingOrder)
    siblings.forEach((row, index) => {
      row.siblingOrder = index
    })
  }

  async restoreBranch(
    input: RestoreWorkItemBranchInput,
  ): Promise<Record<string, string>> {
    const workspaceItems = getWorkspaceItems(input.workspaceId)

    if (input.targetParentId) {
      const parent = workspaceItems.find(
        (item) => item.id === input.targetParentId,
      )
      if (!parent) {
        throw new DomainError(
          DomainErrorCode.PARENT_NOT_FOUND,
          "Target parent not found",
        )
      }
    }

    const snapshotIds = flattenRestoreIds(input.root)
    const existing = workspaceItems.find((item) =>
      snapshotIds.includes(item.id),
    )
    if (existing) {
      throw new DomainError(
        DomainErrorCode.INVALID_MOVE_TARGET,
        "Cannot restore branch with ids that already exist",
      )
    }

    const targetSiblings = workspaceItems
      .filter((row) => row.parentId === input.targetParentId)
      .sort((a, b) => a.siblingOrder - b.siblingOrder)
    const targetIndex = clampIndex(input.targetIndex, targetSiblings.length)
    const targetOrder = targetSiblings.map((row) => row.id)
    targetOrder.splice(targetIndex, 0, input.root.id)

    const now = new Date()
    const created: WorkItem[] = []

    function visit(
      node: RestoreWorkItemBranchInput["root"],
      parentId: string | null,
      siblingOrder: number,
    ) {
      created.push({
        id: node.id,
        workspaceId: node.workspaceId,
        title: node.title,
        object: node.object,
        possiblyRemovable: node.possiblyRemovable,
        parentId,
        siblingOrder,
        overcomplication:
          (node.overcomplication as WorkItem["overcomplication"]) ?? null,
        importance: (node.importance as WorkItem["importance"]) ?? null,
        currentProblems: [...node.currentProblems],
        solutionVariants: [...node.solutionVariants],
        createdAt: now,
        updatedAt: now,
      })

      node.children.forEach((child, index) => {
        visit(child, node.id, index)
      })
    }

    visit(input.root, input.targetParentId, targetIndex)
    workspaceItems.push(...created)
    targetOrder.forEach((id, index) => {
      const item = workspaceItems.find((row) => row.id === id)
      if (item) {
        item.siblingOrder = index
      }
    })

    return Object.fromEntries(snapshotIds.map((id) => [id, id]))
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

  async getById(id: string): Promise<Workspace | null> {
    const existing = memoryStore.workspaces.get(id)
    if (!existing) {
      return null
    }
    return { ...existing }
  }

  async create(input: CreateWorkspaceInput): Promise<Workspace> {
    const workspace = ensureWorkspace(randomUUID(), input.name)
    return { ...workspace }
  }

  async rename(
    id: string,
    input: RenameWorkspaceInput,
  ): Promise<Workspace | null> {
    const existing = memoryStore.workspaces.get(id)
    if (!existing) {
      return null
    }

    const updated: Workspace = {
      ...existing,
      name: input.name,
      updatedAt: new Date(),
    }
    memoryStore.workspaces.set(id, updated)
    return { ...updated }
  }

  async delete(id: string): Promise<boolean> {
    if (!memoryStore.workspaces.has(id)) {
      return false
    }

    const workspaceItems = memoryStore.byWorkspace.get(id) ?? []
    for (const item of workspaceItems) {
      memoryStore.metricValuesByWorkItem.delete(item.id)
    }
    memoryStore.workspaces.delete(id)
    memoryStore.byWorkspace.delete(id)
    memoryStore.metricsByWorkspace.delete(id)
    return true
  }
}

export class InMemoryWorkspaceMetricRepository
  implements WorkspaceMetricRepository
{
  async listMetrics(workspaceId: WorkspaceId): Promise<WorkspaceMetric[]> {
    return [...(memoryStore.metricsByWorkspace.get(workspaceId) ?? [])]
  }

  async createMetric(
    input: CreateWorkspaceMetricInput,
  ): Promise<WorkspaceMetric> {
    const normalized = validateUpsertWorkspaceMetricInput({
      shortName: input.shortName,
      description: input.description,
    })
    const metrics = getWorkspaceMetrics(input.workspaceId)
    const now = new Date()
    const created: WorkspaceMetric = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      shortName: normalized.shortName,
      description: normalized.description,
      createdAt: now,
      updatedAt: now,
    }
    metrics.push(created)
    return { ...created }
  }

  async updateMetric(
    workspaceId: WorkspaceId,
    metricId: string,
    input: UpdateWorkspaceMetricInput,
  ): Promise<WorkspaceMetric | null> {
    const normalized = validateUpsertWorkspaceMetricInput({
      shortName: input.shortName,
      description: input.description,
    })
    const metrics = memoryStore.metricsByWorkspace.get(workspaceId) ?? []
    const metric = metrics.find((item) => item.id === metricId)
    if (!metric) {
      return null
    }
    metric.shortName = normalized.shortName
    metric.description = normalized.description
    metric.updatedAt = new Date()
    return { ...metric }
  }

  async deleteMetric(
    workspaceId: WorkspaceId,
    metricId: string,
  ): Promise<DeletedWorkspaceMetricSnapshot | null> {
    const metrics = memoryStore.metricsByWorkspace.get(workspaceId) ?? []
    const removedMetric = metrics.find((metric) => metric.id === metricId)
    if (!removedMetric) {
      return null
    }
    const targetIndex = metrics.findIndex((metric) => metric.id === metricId)
    const nextMetrics = metrics.filter((metric) => metric.id !== metricId)
    memoryStore.metricsByWorkspace.set(workspaceId, nextMetrics)

    const removedValues: DeletedWorkspaceMetricSnapshot["removedValues"] = []
    for (const [workItemId, values] of memoryStore.metricValuesByWorkItem) {
      const value = values.get(metricId)
      if (value) {
        removedValues.push({ workItemId, value })
      }
      values.delete(metricId)
    }

    return {
      metric: { ...removedMetric },
      targetIndex: targetIndex < 0 ? 0 : targetIndex,
      removedValues: removedValues.sort((left, right) =>
        left.workItemId.localeCompare(right.workItemId),
      ),
    }
  }

  async restoreDeletedMetric(
    workspaceId: WorkspaceId,
    input: RestoreWorkspaceMetricInput,
  ): Promise<WorkspaceMetric | null> {
    const snapshot = input.snapshot.metric
    if (snapshot.workspaceId !== workspaceId) {
      throw new DomainError(
        DomainErrorCode.INVALID_MOVE_TARGET,
        "Metric should belong to the same workspace",
      )
    }

    const normalized = validateUpsertWorkspaceMetricInput({
      shortName: snapshot.shortName,
      description: snapshot.description,
    })
    const metrics = getWorkspaceMetrics(workspaceId)
    if (metrics.some((metric) => metric.id === snapshot.id)) {
      return null
    }

    const insertIndex = clampIndex(input.snapshot.targetIndex, metrics.length)
    const now = new Date()
    const restored: WorkspaceMetric = {
      id: snapshot.id,
      workspaceId,
      shortName: normalized.shortName,
      description: normalized.description,
      createdAt: now,
      updatedAt: now,
    }
    metrics.splice(insertIndex, 0, restored)

    for (const entry of input.snapshot.removedValues) {
      if (entry.value === "none") {
        continue
      }
      const item = findItemById(entry.workItemId)
      if (!item || item.workspaceId !== workspaceId) {
        continue
      }
      const values =
        memoryStore.metricValuesByWorkItem.get(entry.workItemId) ?? new Map()
      values.set(snapshot.id, entry.value)
      memoryStore.metricValuesByWorkItem.set(entry.workItemId, values)
    }

    return { ...restored }
  }

  async setWorkItemMetricValue(
    input: SetWorkItemMetricValueInput,
  ): Promise<void> {
    const item = findItemById(input.workItemId)
    if (!item) {
      throw new DomainError(
        DomainErrorCode.INVALID_MOVE_TARGET,
        "Metric and work item should belong to the same workspace",
      )
    }

    const metrics = memoryStore.metricsByWorkspace.get(item.workspaceId) ?? []
    const metric = metrics.find((candidate) => candidate.id === input.metricId)
    if (!metric) {
      throw new DomainError(
        DomainErrorCode.INVALID_MOVE_TARGET,
        "Metric and work item should belong to the same workspace",
      )
    }

    const values =
      memoryStore.metricValuesByWorkItem.get(input.workItemId) ?? new Map()
    if (input.value === "none") {
      values.delete(input.metricId)
      if (values.size === 0) {
        memoryStore.metricValuesByWorkItem.delete(input.workItemId)
      } else {
        memoryStore.metricValuesByWorkItem.set(input.workItemId, values)
      }
      return
    }

    values.set(input.metricId, input.value)
    memoryStore.metricValuesByWorkItem.set(input.workItemId, values)
  }

  async listWorkItemMetricValues(
    workItemId: string,
  ): Promise<WorkItemMetricValueEntry[]> {
    const values =
      memoryStore.metricValuesByWorkItem.get(workItemId) ?? new Map()
    return [...values.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([metricId, value]) => ({
        workItemId,
        metricId,
        value,
      }))
  }
}

export function __resetInMemoryStoreForTests() {
  memoryStore.byWorkspace.clear()
  memoryStore.workspaces.clear()
  memoryStore.metricsByWorkspace.clear()
  memoryStore.metricValuesByWorkItem.clear()
}
