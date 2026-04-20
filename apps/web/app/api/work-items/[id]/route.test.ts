import { DomainError, DomainErrorCode } from "@ood/domain"
import { beforeEach, describe, expect, it, vi } from "vitest"

const repository = {
  listTree: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  move: vi.fn(),
  deleteCascade: vi.fn(),
}

const workspaceMetricRepository = {
  setWorkItemMetricValue: vi.fn(),
  listWorkItemMetricValues: vi.fn(),
}

vi.mock("../../../../lib/repository", () => ({
  getRepository: () => repository,
}))
vi.mock("../../../../lib/workspace-metric-repository", () => ({
  getWorkspaceMetricRepository: () => workspaceMetricRepository,
}))

import { DELETE, PATCH } from "./route"

describe("PATCH /api/work-items/[id] contract", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    workspaceMetricRepository.listWorkItemMetricValues.mockResolvedValue([])
  })

  it("returns domain error when attempting to update ratings of parent node", async () => {
    repository.update.mockRejectedValueOnce(
      new DomainError(
        DomainErrorCode.PARENT_RATINGS_READ_ONLY,
        "Ratings are read-only for items with child work items",
      ),
    )

    const response = await PATCH(
      new Request("http://localhost/api/work-items/parent", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ overcomplication: 3 }),
      }),
      { params: Promise.resolve({ id: "parent" }) },
    )
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload).toEqual(
      expect.objectContaining({
        error: DomainErrorCode.PARENT_RATINGS_READ_ONLY,
      }),
    )
  })

  it("accepts possiblyRemovable in patch contract", async () => {
    repository.update.mockResolvedValueOnce({
      id: "item-1",
      workspaceId: "ws",
      title: "Item",
      object: null,
      possiblyRemovable: true,
      parentId: null,
      siblingOrder: 0,
      overcomplication: null,
      importance: null,
      currentProblems: [],
      solutionVariants: [],
    })

    const response = await PATCH(
      new Request("http://localhost/api/work-items/item-1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ possiblyRemovable: true }),
      }),
      { params: Promise.resolve({ id: "item-1" }) },
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(repository.update).toHaveBeenCalledWith(
      "item-1",
      expect.objectContaining({ possiblyRemovable: true }),
    )
    expect(payload.data).toMatchObject({ possiblyRemovable: true })
  })

  it("accepts text list fields in patch contract", async () => {
    repository.update.mockResolvedValueOnce({
      id: "item-2",
      workspaceId: "ws",
      title: "Updated title",
      object: "Updated object",
      possiblyRemovable: false,
      parentId: null,
      siblingOrder: 0,
      overcomplication: null,
      importance: null,
      currentProblems: ["p1", "p2"],
      solutionVariants: ["s1"],
    })

    const response = await PATCH(
      new Request("http://localhost/api/work-items/item-2", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "Updated title",
          object: "Updated object",
          currentProblems: ["p1", "p2"],
          solutionVariants: ["s1"],
        }),
      }),
      { params: Promise.resolve({ id: "item-2" }) },
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(repository.update).toHaveBeenCalledWith(
      "item-2",
      expect.objectContaining({
        title: "Updated title",
        object: "Updated object",
        currentProblems: ["p1", "p2"],
        solutionVariants: ["s1"],
      }),
    )
    expect(payload.data).toMatchObject({
      title: "Updated title",
      object: "Updated object",
      currentProblems: ["p1", "p2"],
      solutionVariants: ["s1"],
    })
  })

  it("returns canonical delete response", async () => {
    const response = await DELETE(
      new Request("http://localhost/api/work-items/item-3", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: "item-3" }) },
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(repository.deleteCascade).toHaveBeenCalledWith("item-3")
    expect(payload).toEqual({
      data: {
        id: "item-3",
        mode: "cascade",
      },
    })
  })

  it("persists metric enum patch via workspace metric repository", async () => {
    repository.update.mockResolvedValueOnce({
      id: "item-4",
      workspaceId: "ws",
      title: "Item",
      object: null,
      possiblyRemovable: false,
      parentId: null,
      siblingOrder: 0,
      overcomplication: null,
      importance: null,
      currentProblems: [],
      solutionVariants: [],
    })
    workspaceMetricRepository.listWorkItemMetricValues.mockResolvedValueOnce([
      {
        workItemId: "item-4",
        metricId: "m-1",
        value: "direct",
      },
    ])

    const response = await PATCH(
      new Request("http://localhost/api/work-items/item-4", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          metricValues: { "m-1": "direct" },
        }),
      }),
      { params: Promise.resolve({ id: "item-4" }) },
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(
      workspaceMetricRepository.setWorkItemMetricValue,
    ).toHaveBeenCalledWith({
      workItemId: "item-4",
      metricId: "m-1",
      value: "direct",
    })
    expect(payload.data).toMatchObject({
      metricValues: { "m-1": "direct" },
      metricAggregates: { "m-1": "direct" },
    })
  })
})
