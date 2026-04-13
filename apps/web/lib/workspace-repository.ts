import { type WorkspaceRepository, createWorkspaceRepository } from "@ood/db"

declare global {
  // eslint-disable-next-line no-var
  var __oodWorkspaceRepository: WorkspaceRepository | undefined
}

export function getWorkspaceRepository(): WorkspaceRepository {
  if (!globalThis.__oodWorkspaceRepository) {
    globalThis.__oodWorkspaceRepository = createWorkspaceRepository()
  }

  return globalThis.__oodWorkspaceRepository
}
