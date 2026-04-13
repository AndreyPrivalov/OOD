import type { Workspace, WorkspaceId } from "@ood/domain"
import { asc, eq } from "drizzle-orm"
import type { getDb } from "./client"
import { workspaces } from "./schema"

type DbExecutor = ReturnType<typeof getDb>
type WorkspaceRow = typeof workspaces.$inferSelect

export const DEFAULT_WORKSPACE_ID = "default-workspace"
export const DEFAULT_WORKSPACE_NAME = "Default workspace"

function toWorkspace(row: WorkspaceRow): Workspace {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export async function ensureWorkspace(
  db: DbExecutor,
  workspaceId: WorkspaceId = DEFAULT_WORKSPACE_ID,
  name = DEFAULT_WORKSPACE_NAME,
) {
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
    name,
  })
}

export async function listWorkspaceRows(db: DbExecutor): Promise<Workspace[]> {
  await ensureWorkspace(db)
  const rows = await db
    .select()
    .from(workspaces)
    .orderBy(asc(workspaces.createdAt), asc(workspaces.id))

  return rows.map(toWorkspace)
}

export { toWorkspace }
