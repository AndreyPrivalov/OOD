import { randomUUID } from "node:crypto"
import {
  DomainError,
  DomainErrorCode,
  type WorkItemMetricValueEntry,
  type WorkspaceId,
  type WorkspaceMetric,
  type WorkspaceMetricValue,
  validateUpsertWorkspaceMetricInput,
} from "@ood/domain"
import { and, asc, eq, sql } from "drizzle-orm"
import { getDb } from "./client"
import { workItemMetricValues, workItems, workspaceMetrics } from "./schema"
import { ensureWorkspace } from "./workspace-store"

type DbExecutor = ReturnType<typeof getDb>
type WorkspaceMetricRow = typeof workspaceMetrics.$inferSelect

export interface CreateWorkspaceMetricInput {
  workspaceId: WorkspaceId
  shortName: string
  description?: string | null
}

export interface UpdateWorkspaceMetricInput {
  shortName: string
  description?: string | null
}

export interface SetWorkItemMetricValueInput {
  workItemId: string
  metricId: string
  value: WorkspaceMetricValue
}

export interface WorkspaceMetricRepository {
  listMetrics(workspaceId: WorkspaceId): Promise<WorkspaceMetric[]>
  createMetric(input: CreateWorkspaceMetricInput): Promise<WorkspaceMetric>
  updateMetric(
    metricId: string,
    input: UpdateWorkspaceMetricInput,
  ): Promise<WorkspaceMetric | null>
  deleteMetric(metricId: string): Promise<boolean>
  setWorkItemMetricValue(input: SetWorkItemMetricValueInput): Promise<void>
  listWorkItemMetricValues(
    workItemId: string,
  ): Promise<WorkItemMetricValueEntry[]>
}

function toWorkspaceMetric(row: WorkspaceMetricRow): WorkspaceMetric {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    shortName: row.shortName,
    description: row.description ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export class PostgresWorkspaceMetricRepository
  implements WorkspaceMetricRepository
{
  private readonly db: DbExecutor

  constructor(db: DbExecutor = getDb()) {
    this.db = db
  }

  async listMetrics(workspaceId: WorkspaceId): Promise<WorkspaceMetric[]> {
    const rows = await this.db
      .select()
      .from(workspaceMetrics)
      .where(eq(workspaceMetrics.workspaceId, workspaceId))
      .orderBy(
        asc(workspaceMetrics.siblingOrder),
        asc(workspaceMetrics.createdAt),
      )

    return rows.map(toWorkspaceMetric)
  }

  async createMetric(
    input: CreateWorkspaceMetricInput,
  ): Promise<WorkspaceMetric> {
    const normalized = validateUpsertWorkspaceMetricInput({
      shortName: input.shortName,
      description: input.description,
    })
    await ensureWorkspace(this.db, input.workspaceId)

    return this.db.transaction(async (tx) => {
      const siblings = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(workspaceMetrics)
        .where(eq(workspaceMetrics.workspaceId, input.workspaceId))
      const siblingOrder = siblings[0]?.count ?? 0
      const metricId = randomUUID()

      await tx.insert(workspaceMetrics).values({
        id: metricId,
        workspaceId: input.workspaceId,
        shortName: normalized.shortName,
        description: normalized.description,
        siblingOrder,
      })

      const created = await tx
        .select()
        .from(workspaceMetrics)
        .where(eq(workspaceMetrics.id, metricId))
        .limit(1)

      return toWorkspaceMetric(created[0])
    })
  }

  async updateMetric(
    metricId: string,
    input: UpdateWorkspaceMetricInput,
  ): Promise<WorkspaceMetric | null> {
    const normalized = validateUpsertWorkspaceMetricInput({
      shortName: input.shortName,
      description: input.description,
    })

    const updated = await this.db
      .update(workspaceMetrics)
      .set({
        shortName: normalized.shortName,
        description: normalized.description,
        updatedAt: new Date(),
      })
      .where(eq(workspaceMetrics.id, metricId))
      .returning()

    if (updated.length === 0) {
      return null
    }
    return toWorkspaceMetric(updated[0])
  }

  async deleteMetric(metricId: string): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const deleted = await tx
        .delete(workspaceMetrics)
        .where(eq(workspaceMetrics.id, metricId))
        .returning({
          id: workspaceMetrics.id,
          workspaceId: workspaceMetrics.workspaceId,
          siblingOrder: workspaceMetrics.siblingOrder,
        })

      const removed = deleted[0]
      if (!removed) {
        return false
      }

      const remaining = await tx
        .select({ id: workspaceMetrics.id })
        .from(workspaceMetrics)
        .where(eq(workspaceMetrics.workspaceId, removed.workspaceId))
        .orderBy(
          asc(workspaceMetrics.siblingOrder),
          asc(workspaceMetrics.createdAt),
        )

      for (const [index, metric] of remaining.entries()) {
        await tx
          .update(workspaceMetrics)
          .set({ siblingOrder: index, updatedAt: new Date() })
          .where(eq(workspaceMetrics.id, metric.id))
      }

      return true
    })
  }

  async setWorkItemMetricValue(
    input: SetWorkItemMetricValueInput,
  ): Promise<void> {
    const [itemRows, metricRows] = await Promise.all([
      this.db
        .select({
          id: workItems.id,
          workspaceId: workItems.workspaceId,
        })
        .from(workItems)
        .where(eq(workItems.id, input.workItemId))
        .limit(1),
      this.db
        .select({
          id: workspaceMetrics.id,
          workspaceId: workspaceMetrics.workspaceId,
        })
        .from(workspaceMetrics)
        .where(eq(workspaceMetrics.id, input.metricId))
        .limit(1),
    ])

    const item = itemRows[0]
    const metric = metricRows[0]
    if (!item || !metric || item.workspaceId !== metric.workspaceId) {
      throw new DomainError(
        DomainErrorCode.INVALID_MOVE_TARGET,
        "Metric and work item should belong to the same workspace",
      )
    }

    if (input.value === "none") {
      await this.db
        .delete(workItemMetricValues)
        .where(
          and(
            eq(workItemMetricValues.workItemId, input.workItemId),
            eq(workItemMetricValues.metricId, input.metricId),
          ),
        )
      return
    }

    await this.db
      .insert(workItemMetricValues)
      .values({
        workItemId: input.workItemId,
        metricId: input.metricId,
        value: input.value,
      })
      .onConflictDoUpdate({
        target: [
          workItemMetricValues.workItemId,
          workItemMetricValues.metricId,
        ],
        set: { value: input.value, updatedAt: new Date() },
      })
  }

  async listWorkItemMetricValues(
    workItemId: string,
  ): Promise<WorkItemMetricValueEntry[]> {
    const rows = await this.db
      .select()
      .from(workItemMetricValues)
      .where(eq(workItemMetricValues.workItemId, workItemId))
      .orderBy(asc(workItemMetricValues.metricId))

    return rows.map((row) => ({
      workItemId: row.workItemId,
      metricId: row.metricId,
      value: row.value as WorkspaceMetricValue,
    }))
  }
}

export function createWorkspaceMetricRepository(
  db: DbExecutor = getDb(),
): WorkspaceMetricRepository {
  return new PostgresWorkspaceMetricRepository(db)
}
