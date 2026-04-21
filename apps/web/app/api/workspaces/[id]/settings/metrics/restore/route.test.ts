import { beforeEach, describe, expect, it, vi } from "vitest"

const workspaceRepository = {
  getById: vi.fn(),
}

const metricRepository = {
  restoreDeletedMetric: vi.fn(),
  listMetrics: vi.fn(),
}

vi.mock("../../../../../../../lib/workspace-repository", () => ({
  getWorkspaceRepository: () => workspaceRepository,
}))

vi.mock("../../../../../../../lib/workspace-metric-repository", () => ({
  getWorkspaceMetricRepository: () => metricRepository,
}))

import { POST } from "./route"

describe("POST /api/workspaces/:id/settings/metrics/restore", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("restores deleted metric snapshot and returns canonical settings shape", async () => {
    workspaceRepository.getById.mockResolvedValueOnce({
      id: "ws-1",
      name: "Alpha",
      createdAt: new Date("2026-04-20T12:00:00.000Z"),
      updatedAt: new Date("2026-04-20T12:00:00.000Z"),
    })
    metricRepository.restoreDeletedMetric.mockResolvedValueOnce({
      id: "m-1",
    })
    metricRepository.listMetrics.mockResolvedValueOnce([
      {
        id: "m-1",
        workspaceId: "ws-1",
        shortName: "Impact",
        description: null,
      },
    ])

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          snapshot: {
            metric: {
              id: "m-1",
              shortName: " Impact ",
              description: null,
            },
            targetIndex: 0,
            removedValues: [{ workItemId: "w-1", value: "direct" }],
          },
        }),
      }),
      { params: Promise.resolve({ id: "ws-1" }) },
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(metricRepository.restoreDeletedMetric).toHaveBeenCalledWith("ws-1", {
      snapshot: {
        metric: {
          id: "m-1",
          workspaceId: "ws-1",
          shortName: "Impact",
          description: null,
        },
        targetIndex: 0,
        removedValues: [{ workItemId: "w-1", value: "direct" }],
      },
    })
    expect(payload.data.metrics).toEqual([
      {
        id: "m-1",
        shortName: "Impact",
        description: null,
      },
    ])
  })
})
