import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { createWorkItemRepositoryMock } = vi.hoisted(() => ({
  createWorkItemRepositoryMock: vi.fn(),
}))

vi.mock("@ood/db", () => ({
  createWorkItemRepository: createWorkItemRepositoryMock,
}))

import { getRepository } from "./repository"

function resetRepositorySingleton() {
  // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
  ;(globalThis as { __oodRepository?: unknown }).__oodRepository = undefined
}

describe("getRepository", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
    resetRepositorySingleton()
    createWorkItemRepositoryMock.mockReset()
  })

  afterEach(() => {
    resetRepositorySingleton()
  })

  it("creates repository once and reuses singleton", () => {
    const repositoryInstance = { name: "repo" }
    createWorkItemRepositoryMock.mockReturnValue(repositoryInstance)

    const firstRepository = getRepository()
    const secondRepository = getRepository()

    expect(firstRepository).toBe(repositoryInstance)
    expect(secondRepository).toBe(repositoryInstance)
    expect(createWorkItemRepositoryMock).toHaveBeenCalledTimes(1)
  })

  it("surfaces repository factory errors", () => {
    const error = new Error("DATABASE_URL is required to initialize DB client")
    createWorkItemRepositoryMock.mockImplementation(() => {
      throw error
    })

    expect(() => getRepository()).toThrow(error)
  })
})
