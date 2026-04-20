import { randomUUID } from "node:crypto"
import type { Workspace } from "@ood/domain"
import { eq } from "drizzle-orm"
import { getDb } from "./client"
import { workspaces } from "./schema"
import { listWorkspaceRows, toWorkspace } from "./workspace-store"

type DbExecutor = ReturnType<typeof getDb>

export interface CreateWorkspaceInput {
  name: string
}

export interface RenameWorkspaceInput {
  name: string
}

export interface WorkspaceRepository {
  list(): Promise<Workspace[]>
  getById(id: string): Promise<Workspace | null>
  create(input: CreateWorkspaceInput): Promise<Workspace>
  rename(id: string, input: RenameWorkspaceInput): Promise<Workspace | null>
  delete(id: string): Promise<boolean>
}

export class PostgresWorkspaceRepository implements WorkspaceRepository {
  private readonly db: DbExecutor

  constructor(db: DbExecutor = getDb()) {
    this.db = db
  }

  async list(): Promise<Workspace[]> {
    return listWorkspaceRows(this.db)
  }

  async getById(id: string): Promise<Workspace | null> {
    const rows = await this.db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, id))
      .limit(1)

    return rows[0] ? toWorkspace(rows[0]) : null
  }

  async create(input: CreateWorkspaceInput): Promise<Workspace> {
    const id = randomUUID()

    await this.db.insert(workspaces).values({
      id,
      name: input.name,
    })

    const created = await this.db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, id))
      .limit(1)

    return toWorkspace(created[0])
  }

  async rename(
    id: string,
    input: RenameWorkspaceInput,
  ): Promise<Workspace | null> {
    const updated = await this.db
      .update(workspaces)
      .set({
        name: input.name,
        updatedAt: new Date(),
      })
      .where(eq(workspaces.id, id))
      .returning()

    if (updated.length === 0) {
      return null
    }

    return toWorkspace(updated[0])
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await this.db
      .delete(workspaces)
      .where(eq(workspaces.id, id))
      .returning({ id: workspaces.id })

    return deleted.length > 0
  }
}

export function createWorkspaceRepository(
  db: DbExecutor = getDb(),
): WorkspaceRepository {
  return new PostgresWorkspaceRepository(db)
}
