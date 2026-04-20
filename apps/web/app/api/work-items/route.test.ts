import { beforeEach, describe, expect, it, vi } from "vitest"

const repository = {
  listTree: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  move: vi.fn(),
  deleteCascade: vi.fn(),
}

const workspaceMetricRepository = {
  listMetrics: vi.fn(),
  listWorkItemMetricValues: vi.fn(),
}

vi.mock("../../../lib/repository", () => ({
  getRepository: () => repository,
}))
vi.mock("../../../lib/workspace-metric-repository", () => ({
  getWorkspaceMetricRepository: () => workspaceMetricRepository,
}))

import { GET, POST } from "./route"

describe("GET /api/work-items contract", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    workspaceMetricRepository.listMetrics.mockResolvedValue([])
    workspaceMetricRepository.listWorkItemMetricValues.mockResolvedValue([])
  })

  it("returns mandatory top-level score sums for every node", async () => {
    workspaceMetricRepository.listMetrics.mockResolvedValueOnce([
      {
        id: "metric-1",
        workspaceId: "ws",
        shortName: "Impact",
        description: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])
    repository.listTree.mockResolvedValueOnce([
      {
        id: "root",
        workspaceId: "ws",
        title: "root",
        object: null,
        parentId: null,
        siblingOrder: 0,
        overcomplication: null,
        importance: null,
        blocksMoney: null,
        overcomplicationSum: 0,
        importanceSum: 0,
        blocksMoneySum: 0,
        currentProblems: [],
        solutionVariants: [],
        children: [
          {
            id: "leaf",
            workspaceId: "ws",
            title: "leaf",
            object: null,
            parentId: "root",
            siblingOrder: 0,
            overcomplication: 2,
            importance: 3,
            blocksMoney: 1,
            overcomplicationSum: 0,
            importanceSum: 3,
            blocksMoneySum: 0,
            currentProblems: [],
            solutionVariants: [],
            children: [],
          },
        ],
      },
    ])
    workspaceMetricRepository.listWorkItemMetricValues
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { workItemId: "leaf", metricId: "metric-1", value: "direct" },
      ])

    const response = await GET(
      new Request("http://localhost/api/work-items?workspaceId=ws"),
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.data[0]).toMatchObject({
      overcomplicationSum: 0,
      importanceSum: 0,
      blocksMoneySum: 0,
      metricAggregates: { "metric-1": "direct" },
    })
    expect(payload.data[0].children[0]).toMatchObject({
      overcomplicationSum: 0,
      importanceSum: 3,
      blocksMoneySum: 0,
      metricValues: { "metric-1": "direct" },
      metricAggregates: { "metric-1": "direct" },
    })
  })

  it("accepts and returns possiblyRemovable for create contract", async () => {
    repository.create.mockResolvedValueOnce({
      id: "new-item",
      workspaceId: "ws",
      title: "New",
      object: null,
      possiblyRemovable: true,
      parentId: null,
      siblingOrder: 0,
      overcomplication: null,
      importance: null,
      blocksMoney: null,
      currentProblems: [],
      solutionVariants: [],
    })

    const response = await POST(
      new Request("http://localhost/api/work-items", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceId: "ws",
          title: "New",
          possiblyRemovable: true,
        }),
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(201)
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws",
        title: "New",
        possiblyRemovable: true,
      }),
    )
    expect(payload.data).toMatchObject({
      id: "new-item",
      possiblyRemovable: true,
    })
  })
})
