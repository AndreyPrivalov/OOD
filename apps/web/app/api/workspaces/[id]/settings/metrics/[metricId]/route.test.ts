import { beforeEach, describe, expect, it, vi } from "vitest"

const workspaceRepository = {
  getById: vi.fn(),
}

const metricRepository = {
  updateMetric: vi.fn(),
  deleteMetric: vi.fn(),
  listMetrics: vi.fn(),
}

vi.mock("../../../../../../../lib/workspace-repository", () => ({
  getWorkspaceRepository: () => workspaceRepository,
}))

vi.mock("../../../../../../../lib/workspace-metric-repository", () => ({
  getWorkspaceMetricRepository: () => metricRepository,
}))

import { DELETE, PATCH } from "./route"

describe("PATCH /api/workspaces/:id/settings/metrics/:metricId", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("updates metric and returns canonical settings shape", async () => {
    workspaceRepository.getById.mockResolvedValueOnce({
      id: "ws-1",
      name: "Alpha",
      createdAt: new Date("2026-04-20T12:00:00.000Z"),
      updatedAt: new Date("2026-04-20T12:00:00.000Z"),
    })
    metricRepository.updateMetric.mockResolvedValueOnce({
      id: "m-1",
    })
    metricRepository.listMetrics.mockResolvedValueOnce([
      {
        id: "m-1",
        workspaceId: "ws-1",
        shortName: "Impact+",
        description: "updated",
      },
    ])

    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          shortName: " Impact+ ",
          description: "updated",
        }),
      }),
      { params: Promise.resolve({ id: "ws-1", metricId: "m-1" }) },
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(metricRepository.updateMetric).toHaveBeenCalledWith("ws-1", "m-1", {
      shortName: "Impact+",
      description: "updated",
    })
    expect(payload.data.metrics).toEqual([
      { id: "m-1", shortName: "Impact+", description: "updated" },
    ])
  })
})

describe("DELETE /api/workspaces/:id/settings/metrics/:metricId", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("deletes metric without server-side confirm flow", async () => {
    workspaceRepository.getById.mockResolvedValueOnce({
      id: "ws-1",
      name: "Alpha",
      createdAt: new Date("2026-04-20T12:00:00.000Z"),
      updatedAt: new Date("2026-04-20T12:00:00.000Z"),
    })
    metricRepository.deleteMetric.mockResolvedValueOnce(true)
    metricRepository.listMetrics.mockResolvedValueOnce([])

    const response = await DELETE(new Request("http://localhost"), {
      params: Promise.resolve({ id: "ws-1", metricId: "m-1" }),
    })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(metricRepository.deleteMetric).toHaveBeenCalledWith("ws-1", "m-1")
    expect(payload.data.metrics).toEqual([])
  })
})
