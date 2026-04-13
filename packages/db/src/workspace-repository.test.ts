import { beforeEach, describe, expect, it } from "vitest"
import {
  InMemoryWorkspaceRepository,
  __resetInMemoryStoreForTests,
} from "./testing"
import { DEFAULT_WORKSPACE_ID } from "./workspace-store"

describe("InMemoryWorkspaceRepository", () => {
  beforeEach(() => {
    __resetInMemoryStoreForTests()
  })

  it("returns the default workspace when the store is empty", async () => {
    const repo = new InMemoryWorkspaceRepository()

    const workspaces = await repo.list()

    expect(workspaces).toHaveLength(1)
    expect(workspaces[0]).toMatchObject({
      id: DEFAULT_WORKSPACE_ID,
      name: "Default workspace",
    })
  })

  it("creates a shared workspace and includes it in the list", async () => {
    const repo = new InMemoryWorkspaceRepository()

    const created = await repo.create({ name: "Alpha" })
    const workspaces = await repo.list()

    expect(created).toMatchObject({ name: "Alpha" })
    expect(workspaces.map((workspace) => workspace.id)).toContain(created.id)
  })
})
