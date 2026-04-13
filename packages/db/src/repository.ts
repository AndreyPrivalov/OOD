import { randomUUID } from "node:crypto"
import {
  type CreateWorkItemInput,
  DomainError,
  DomainErrorCode,
  type MoveWorkItemInput,
  type UpdateWorkItemInput,
  type WorkItem,
  type WorkTreeReadNode,
  type WorkspaceId,
  buildTree,
  withScoreSums,
} from "@ood/domain"
import { and, asc, eq, isNull, ne, sql } from "drizzle-orm"
import { getDb } from "./client"
import { workItems, workspaces } from "./schema"

export interface WorkItemRepository {
  listTree(workspaceId: WorkspaceId): Promise<WorkTreeReadNode[]>
  create(input: CreateWorkItemInput): Promise<WorkItem>
  update(id: string, patch: UpdateWorkItemInput): Promise<WorkItem>
  move(id: string, input: MoveWorkItemInput): Promise<void>
  deleteCascade(id: string): Promise<void>
  replaceWorkspaceTree(
    workspaceId: WorkspaceId,
    items: ReplaceWorkspaceTreeInput[],
  ): Promise<WorkItem[]>
}

export interface ReplaceWorkspaceTreeInput {
  tempId: string
  parentTempId: string | null
  title: string
  siblingOrder: number
}

type DbExecutor = ReturnType<typeof getDb>
type WorkItemRow = typeof workItems.$inferSelect
type SiblingReorderExecutor = {
  update: DbExecutor["update"]
}
type CycleCheckExecutor = {
  execute: DbExecutor["execute"]
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === "string")
}

function toDomainWorkItem(row: WorkItemRow): WorkItem {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    title: row.title,
    object: row.object ?? null,
    possiblyRemovable: row.possiblyRemovable,
    parentId: row.parentId ?? null,
    siblingOrder: row.siblingOrder,
    overcomplication:
      (row.overcomplication as WorkItem["overcomplication"]) ?? null,
    importance: (row.importance as WorkItem["importance"]) ?? null,
    blocksMoney: (row.blocksMoney as WorkItem["blocksMoney"]) ?? null,
    currentProblems: parseStringArray(row.currentProblems),
    solutionVariants: parseStringArray(row.solutionVariants),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
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

function siblingFilter(workspaceId: string, parentId: string | null) {
  if (parentId === null) {
    return and(
      eq(workItems.workspaceId, workspaceId),
      isNull(workItems.parentId),
    )
  }
  return and(
    eq(workItems.workspaceId, workspaceId),
    eq(workItems.parentId, parentId),
  )
}

async function ensureWorkspace(db: DbExecutor, workspaceId: string) {
  const existing = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1)
  if (existing.length > 0) {
    return
  }
  await db.insert(workspaces).values({
    id: workspaceId,
    name: "Default workspace",
  })
}

export class PostgresWorkItemRepository implements WorkItemRepository {
  private readonly db: DbExecutor

  constructor(db: DbExecutor = getDb()) {
    this.db = db
  }

  async listTree(workspaceId: WorkspaceId): Promise<WorkTreeReadNode[]> {
    await ensureWorkspace(this.db, workspaceId)
    const rows = await this.db
      .select()
      .from(workItems)
      .where(eq(workItems.workspaceId, workspaceId))
      .orderBy(asc(workItems.siblingOrder), asc(workItems.createdAt))
    return withScoreSums(buildTree(rows.map(toDomainWorkItem)))
  }

  async create(input: CreateWorkItemInput): Promise<WorkItem> {
    await ensureWorkspace(this.db, input.workspaceId)
    return this.db.transaction(async (tx) => {
      if (input.parentId) {
        const parent = await tx
          .select({ id: workItems.id, workspaceId: workItems.workspaceId })
          .from(workItems)
          .where(eq(workItems.id, input.parentId))
          .limit(1)
        if (
          parent.length === 0 ||
          parent[0].workspaceId !== input.workspaceId
        ) {
          throw new DomainError(
            DomainErrorCode.PARENT_NOT_FOUND,
            "Parent was not found in current workspace",
          )
        }
      }

      const siblings = await tx
        .select({ id: workItems.id })
        .from(workItems)
        .where(siblingFilter(input.workspaceId, input.parentId ?? null))
        .orderBy(asc(workItems.siblingOrder), asc(workItems.createdAt))

      const workItemId = randomUUID()
      const index = clampIndex(
        input.siblingOrder ?? siblings.length,
        siblings.length,
      )
      const siblingIds = siblings.map((sibling) => sibling.id)
      siblingIds.splice(index, 0, workItemId)

      await tx.insert(workItems).values({
        id: workItemId,
        workspaceId: input.workspaceId,
        title: input.title ?? "",
        object: input.object ?? null,
        possiblyRemovable: input.possiblyRemovable ?? false,
        parentId: input.parentId ?? null,
        siblingOrder: index,
        overcomplication: input.overcomplication ?? null,
        importance: input.importance ?? null,
        blocksMoney: input.blocksMoney ?? null,
        currentProblems: input.currentProblems ?? [],
        solutionVariants: input.solutionVariants ?? [],
      })

      await this.reorderSiblings(tx, siblingIds)

      const created = await tx
        .select()
        .from(workItems)
        .where(eq(workItems.id, workItemId))
        .limit(1)
      return toDomainWorkItem(created[0])
    })
  }

  async update(id: string, patch: UpdateWorkItemInput): Promise<WorkItem> {
    const existing = await this.db
      .select()
      .from(workItems)
      .where(eq(workItems.id, id))
      .limit(1)
    if (existing.length === 0) {
      throw new DomainError(
        DomainErrorCode.INVALID_MOVE_TARGET,
        "Work item not found",
      )
    }

    if (hasRatingUpdate(patch)) {
      const childRows = await this.db
        .select({ id: workItems.id })
        .from(workItems)
        .where(eq(workItems.parentId, id))
        .limit(1)
      if (childRows.length > 0) {
        throw new DomainError(
          DomainErrorCode.PARENT_RATINGS_READ_ONLY,
          "Ratings are read-only for items with child work items",
        )
      }
    }

    const updates: Partial<typeof workItems.$inferInsert> = {
      updatedAt: new Date(),
    }
    if (patch.title !== undefined) updates.title = patch.title
    if (patch.object !== undefined) updates.object = patch.object
    if (patch.possiblyRemovable !== undefined) {
      updates.possiblyRemovable = patch.possiblyRemovable
    }
    if (patch.overcomplication !== undefined) {
      updates.overcomplication = patch.overcomplication
    }
    if (patch.importance !== undefined) updates.importance = patch.importance
    if (patch.blocksMoney !== undefined) updates.blocksMoney = patch.blocksMoney
    if (patch.currentProblems !== undefined) {
      updates.currentProblems = patch.currentProblems
    }
    if (patch.solutionVariants !== undefined) {
      updates.solutionVariants = patch.solutionVariants
    }

    await this.db.update(workItems).set(updates).where(eq(workItems.id, id))
    const updated = await this.db
      .select()
      .from(workItems)
      .where(eq(workItems.id, id))
      .limit(1)
    return toDomainWorkItem(updated[0])
  }

  async move(id: string, input: MoveWorkItemInput): Promise<void> {
    await this.db.transaction(async (tx) => {
      const movingRows = await tx
        .select()
        .from(workItems)
        .where(eq(workItems.id, id))
        .limit(1)
      if (movingRows.length === 0) {
        throw new DomainError(
          DomainErrorCode.INVALID_MOVE_TARGET,
          "Moving work item not found",
        )
      }
      const moving = movingRows[0]

      if (input.targetParentId) {
        const parentRows = await tx
          .select()
          .from(workItems)
          .where(eq(workItems.id, input.targetParentId))
          .limit(1)
        if (parentRows.length === 0) {
          throw new DomainError(
            DomainErrorCode.PARENT_NOT_FOUND,
            "Target parent not found",
          )
        }
        if (parentRows[0].workspaceId !== moving.workspaceId) {
          throw new DomainError(
            DomainErrorCode.INVALID_MOVE_TARGET,
            "Target parent belongs to another workspace",
          )
        }
        await this.assertNoCycle(tx, moving.id, input.targetParentId)
      }

      const targetSiblings = await tx
        .select({ id: workItems.id })
        .from(workItems)
        .where(
          and(
            siblingFilter(moving.workspaceId, input.targetParentId),
            ne(workItems.id, moving.id),
          ),
        )
        .orderBy(asc(workItems.siblingOrder), asc(workItems.createdAt))

      const targetOrder = targetSiblings.map((row) => row.id)
      const targetIndex = clampIndex(input.targetIndex, targetOrder.length)
      targetOrder.splice(targetIndex, 0, moving.id)

      await tx
        .update(workItems)
        .set({
          parentId: input.targetParentId,
          siblingOrder: targetIndex,
          updatedAt: new Date(),
        })
        .where(eq(workItems.id, moving.id))
      await this.reorderSiblings(tx, targetOrder)

      if (moving.parentId !== input.targetParentId) {
        const previousSiblings = await tx
          .select({ id: workItems.id })
          .from(workItems)
          .where(
            and(
              siblingFilter(moving.workspaceId, moving.parentId),
              ne(workItems.id, moving.id),
            ),
          )
          .orderBy(asc(workItems.siblingOrder), asc(workItems.createdAt))
        await this.reorderSiblings(
          tx,
          previousSiblings.map((row) => row.id),
        )
      }
    })
  }

  async deleteCascade(id: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const rows = await tx
        .select({
          id: workItems.id,
          workspaceId: workItems.workspaceId,
          parentId: workItems.parentId,
        })
        .from(workItems)
        .where(eq(workItems.id, id))
        .limit(1)
      if (rows.length === 0) {
        return
      }
      const current = rows[0]
      await tx.delete(workItems).where(eq(workItems.id, id))

      const siblings = await tx
        .select({ id: workItems.id })
        .from(workItems)
        .where(siblingFilter(current.workspaceId, current.parentId))
        .orderBy(asc(workItems.siblingOrder), asc(workItems.createdAt))
      await this.reorderSiblings(
        tx,
        siblings.map((row) => row.id),
      )
    })
  }

  async replaceWorkspaceTree(
    workspaceId: WorkspaceId,
    items: ReplaceWorkspaceTreeInput[],
  ): Promise<WorkItem[]> {
    await ensureWorkspace(this.db, workspaceId)
    return this.db.transaction(async (tx) => {
      await tx.delete(workItems).where(eq(workItems.workspaceId, workspaceId))

      const tempToReal = new Map<string, string>()
      const created: WorkItem[] = []
      const now = new Date()

      for (const item of items) {
        const parentId = item.parentTempId
          ? (tempToReal.get(item.parentTempId) ?? null)
          : null
        if (item.parentTempId && parentId === null) {
          throw new DomainError(
            DomainErrorCode.INVALID_MOVE_TARGET,
            `Parent reference was not found for tempId=${item.parentTempId}`,
          )
        }
        const id = randomUUID()
        await tx.insert(workItems).values({
          id,
          workspaceId,
          title: item.title,
          object: null,
          possiblyRemovable: false,
          parentId,
          siblingOrder: item.siblingOrder,
          overcomplication: null,
          importance: null,
          blocksMoney: null,
          currentProblems: [],
          solutionVariants: [],
        })
        tempToReal.set(item.tempId, id)
        created.push({
          id,
          workspaceId,
          title: item.title,
          object: null,
          possiblyRemovable: false,
          parentId,
          siblingOrder: item.siblingOrder,
          overcomplication: null,
          importance: null,
          blocksMoney: null,
          currentProblems: [],
          solutionVariants: [],
          createdAt: now,
          updatedAt: now,
        })
      }

      return created
    })
  }

  private async reorderSiblings(
    tx: SiblingReorderExecutor,
    orderedIds: string[],
  ) {
    for (const [index, itemId] of orderedIds.entries()) {
      await tx
        .update(workItems)
        .set({ siblingOrder: index, updatedAt: new Date() })
        .where(eq(workItems.id, itemId))
    }
  }

  private async assertNoCycle(
    tx: CycleCheckExecutor,
    movingId: string,
    targetParentId: string,
  ) {
    const result = await tx.execute(sql<{ id: string }>`
      with recursive descendants as (
        select id, parent_id
        from work_items
        where id = ${movingId}
        union all
        select wi.id, wi.parent_id
        from work_items wi
        inner join descendants d on wi.parent_id = d.id
      )
      select id from descendants where id = ${targetParentId}
      limit 1
    `)
    if (result.rows.length > 0) {
      throw new DomainError(
        DomainErrorCode.CYCLE_DETECTED,
        "Cannot move item into its own subtree",
      )
    }
  }
}

export function createWorkItemRepository(
  db: DbExecutor = getDb(),
): WorkItemRepository {
  return new PostgresWorkItemRepository(db)
}
