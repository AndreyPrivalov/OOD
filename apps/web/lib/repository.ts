import { type WorkItemRepository, createWorkItemRepository } from "@ood/db"

declare global {
  // eslint-disable-next-line no-var
  var __oodRepository: WorkItemRepository | undefined
}

export function getRepository(): WorkItemRepository {
  if (!globalThis.__oodRepository) {
    globalThis.__oodRepository = createWorkItemRepository()
  }
  return globalThis.__oodRepository
}
