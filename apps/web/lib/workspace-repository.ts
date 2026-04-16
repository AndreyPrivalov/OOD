import { type WorkspaceRepository, createWorkspaceRepository } from "@ood/db"

declare global {
  // eslint-disable-next-line no-var
  var __oodWorkspaceRepository: WorkspaceRepository | undefined
}

function isWorkspaceRepository(
  value: WorkspaceRepository | undefined,
): value is WorkspaceRepository {
  if (!value) {
    return false
  }

  return (
    typeof value.list === "function" &&
    typeof value.create === "function" &&
    typeof value.rename === "function" &&
    typeof value.delete === "function"
  )
}

export function getWorkspaceRepository(): WorkspaceRepository {
  if (!isWorkspaceRepository(globalThis.__oodWorkspaceRepository)) {
    globalThis.__oodWorkspaceRepository = createWorkspaceRepository()
  }

  return globalThis.__oodWorkspaceRepository
}
