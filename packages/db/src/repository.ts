import { randomUUID } from "node:crypto"
import {
  type CreateWorkItemInput,
  DomainError,
  DomainErrorCode,
  type MoveWorkItemInput,
  type RestoreWorkItemBranchInput,
  type UpdateWorkItemInput,
  type WorkItem,
  type WorkTreeReadNode,
  type WorkspaceId,
  type WorkspaceMetricValue,
  buildTree,
  validateCreateWorkItemInput,
  withScoreSums,
} from "@ood/domain"
import { and, asc, eq, inArray, isNull, ne, sql } from "drizzle-orm"
import { getDb } from "./client"
import { workItemMetricValues, workItems, workspaceMetrics } from "./schema"
import { clampIndex, hasRatingUpdate } from "./work-item-repository-shared"
import { ensureWorkspace } from "./workspace-store"

export interface WorkItemRepository {
  listTree(workspaceId: WorkspaceId): Promise<WorkTreeReadNode[]>
  create(input: CreateWorkItemInput): Promise<WorkItem>
  update(id: string, patch: UpdateWorkItemInput): Promise<WorkItem>
  move(id: string, input: MoveWorkItemInput): Promise<void>
  deleteCascade(id: string): Promise<void>
  restoreBranch(
    input: RestoreWorkItemBranchInput,
  ): Promise<Record<string, string>>
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
    currentProblems: parseStringArray(row.currentProblems),
    solutionVariants: parseStringArray(row.solutionVariants),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
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

function flattenRestoreSnapshot(input: RestoreWorkItemBranchInput) {
  const rows: Array<{
    id: string
    workspaceId: string
    title: string
    object: string | null
    possiblyRemovable: boolean
    parentId: string | null
    siblingOrder: number
    overcomplication: number | null
    importance: number | null
    currentProblems: string[]
    solutionVariants: string[]
  }> = []

  function visit(
    node: RestoreWorkItemBranchInput["root"],
    parentId: string | null,
    siblingOrder: number,
  ) {
    rows.push({
      id: node.id,
      workspaceId: node.workspaceId,
      title: node.title,
      object: node.object,
      possiblyRemovable: node.possiblyRemovable,
      parentId,
      siblingOrder,
      overcomplication: node.overcomplication ?? null,
      importance: node.importance ?? null,
      currentProblems: node.currentProblems,
      solutionVariants: node.solutionVariants,
    })

    node.children.forEach((child, index) => {
      visit(child, node.id, index)
    })
  }

  visit(input.root, input.targetParentId, input.targetIndex)
  return rows
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
    const validatedInput = validateCreateWorkItemInput(input)
    await ensureWorkspace(this.db, validatedInput.workspaceId)
    return this.db.transaction(async (tx) => {
      if (validatedInput.parentId) {
        const parent = await tx
          .select({ id: workItems.id, workspaceId: workItems.workspaceId })
          .from(workItems)
          .where(eq(workItems.id, validatedInput.parentId))
          .limit(1)
        if (
          parent.length === 0 ||
          parent[0].workspaceId !== validatedInput.workspaceId
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
        .where(
          siblingFilter(
            validatedInput.workspaceId,
            validatedInput.parentId ?? null,
          ),
        )
        .orderBy(asc(workItems.siblingOrder), asc(workItems.createdAt))

      const workItemId = randomUUID()
      const index = clampIndex(
        validatedInput.siblingOrder ?? siblings.length,
        siblings.length,
      )
      const siblingIds = siblings.map((sibling) => sibling.id)
      siblingIds.splice(index, 0, workItemId)

      await tx.insert(workItems).values({
        id: workItemId,
        workspaceId: validatedInput.workspaceId,
        title: validatedInput.title,
        object: validatedInput.object ?? null,
        possiblyRemovable: validatedInput.possiblyRemovable ?? false,
        parentId: validatedInput.parentId ?? null,
        siblingOrder: index,
        overcomplication: validatedInput.overcomplication ?? null,
        importance: validatedInput.importance ?? null,
        currentProblems: validatedInput.currentProblems ?? [],
        solutionVariants: validatedInput.solutionVariants ?? [],
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
    return this.db.transaction(async (tx) => {
      const existing = await tx
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
      const current = existing[0]

      if (hasRatingUpdate(patch)) {
        const childRows = await tx
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

      const metricPatch = patch.metricValues
      if (metricPatch) {
        const metricIds = Object.keys(metricPatch)
        if (metricIds.length > 0) {
          const metricRows = await tx
            .select({ id: workspaceMetrics.id })
            .from(workspaceMetrics)
            .where(
              and(
                eq(workspaceMetrics.workspaceId, current.workspaceId),
                inArray(workspaceMetrics.id, metricIds),
              ),
            )
            .limit(metricIds.length)
          if (metricRows.length !== metricIds.length) {
            throw new DomainError(
              DomainErrorCode.INVALID_MOVE_TARGET,
              "Metric and work item should belong to the same workspace",
            )
          }
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
      if (patch.currentProblems !== undefined) {
        updates.currentProblems = patch.currentProblems
      }
      if (patch.solutionVariants !== undefined) {
        updates.solutionVariants = patch.solutionVariants
      }

      await tx.update(workItems).set(updates).where(eq(workItems.id, id))

      if (metricPatch) {
        for (const [metricId, value] of Object.entries(metricPatch) as Array<
          [string, WorkspaceMetricValue]
        >) {
          if (value === "none") {
            await tx
              .delete(workItemMetricValues)
              .where(
                and(
                  eq(workItemMetricValues.workItemId, id),
                  eq(workItemMetricValues.metricId, metricId),
                ),
              )
            continue
          }

          await tx
            .insert(workItemMetricValues)
            .values({
              workItemId: id,
              metricId,
              value,
            })
            .onConflictDoUpdate({
              target: [
                workItemMetricValues.workItemId,
                workItemMetricValues.metricId,
              ],
              set: { value, updatedAt: new Date() },
            })
        }
      }

      const updated = await tx
        .select()
        .from(workItems)
        .where(eq(workItems.id, id))
        .limit(1)
      return toDomainWorkItem(updated[0])
    })
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
      await tx.execute(sql`
        with recursive descendants as (
          select id
          from work_items
          where id = ${id}
          union all
          select wi.id
          from work_items wi
          inner join descendants d on wi.parent_id = d.id
        )
        delete from work_items
        where id in (select id from descendants)
      `)

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

  async restoreBranch(
    input: RestoreWorkItemBranchInput,
  ): Promise<Record<string, string>> {
    await ensureWorkspace(this.db, input.workspaceId)

    return this.db.transaction(async (tx) => {
      if (input.targetParentId) {
        const parentRows = await tx
          .select({ id: workItems.id, workspaceId: workItems.workspaceId })
          .from(workItems)
          .where(eq(workItems.id, input.targetParentId))
          .limit(1)

        if (
          parentRows.length === 0 ||
          parentRows[0].workspaceId !== input.workspaceId
        ) {
          throw new DomainError(
            DomainErrorCode.PARENT_NOT_FOUND,
            "Target parent not found",
          )
        }
      }

      const snapshotRows = flattenRestoreSnapshot(input)
      const snapshotIds = snapshotRows.map((row) => row.id)
      const existingRows = await tx
        .select({ id: workItems.id })
        .from(workItems)
        .where(inArray(workItems.id, snapshotIds))

      if (existingRows.length > 0) {
        throw new DomainError(
          DomainErrorCode.INVALID_MOVE_TARGET,
          "Cannot restore branch with ids that already exist",
        )
      }

      const targetSiblings = await tx
        .select({ id: workItems.id })
        .from(workItems)
        .where(siblingFilter(input.workspaceId, input.targetParentId))
        .orderBy(asc(workItems.siblingOrder), asc(workItems.createdAt))

      const targetOrder = targetSiblings.map((row) => row.id)
      const targetIndex = clampIndex(input.targetIndex, targetOrder.length)
      targetOrder.splice(targetIndex, 0, input.root.id)

      const now = new Date()
      for (const row of snapshotRows) {
        await tx.insert(workItems).values({
          ...row,
          siblingOrder:
            row.id === input.root.id ? targetIndex : row.siblingOrder,
          createdAt: now,
          updatedAt: now,
        })
      }

      await this.reorderSiblings(tx, targetOrder)
      return Object.fromEntries(snapshotIds.map((id) => [id, id]))
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
