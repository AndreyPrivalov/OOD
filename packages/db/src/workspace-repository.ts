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

export interface WorkspaceRepository {
  list(): Promise<Workspace[]>
  create(input: CreateWorkspaceInput): Promise<Workspace>
}

export class PostgresWorkspaceRepository implements WorkspaceRepository {
  private readonly db: DbExecutor

  constructor(db: DbExecutor = getDb()) {
    this.db = db
  }

  async list(): Promise<Workspace[]> {
    return listWorkspaceRows(this.db)
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
}

export function createWorkspaceRepository(
  db: DbExecutor = getDb(),
): WorkspaceRepository {
  return new PostgresWorkspaceRepository(db)
}
