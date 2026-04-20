import { beforeEach, describe, expect, it, vi } from "vitest"

const workspaceRepository = {
  getById: vi.fn(),
}

const metricRepository = {
  createMetric: vi.fn(),
  listMetrics: vi.fn(),
}

vi.mock("../../../../../../lib/workspace-repository", () => ({
  getWorkspaceRepository: () => workspaceRepository,
}))

vi.mock("../../../../../../lib/workspace-metric-repository", () => ({
  getWorkspaceMetricRepository: () => metricRepository,
}))

import { POST } from "./route"

describe("POST /api/workspaces/:id/settings/metrics", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("creates metric and returns canonical settings shape", async () => {
    workspaceRepository.getById.mockResolvedValueOnce({
      id: "ws-1",
      name: "Alpha",
      createdAt: new Date("2026-04-20T12:00:00.000Z"),
      updatedAt: new Date("2026-04-20T12:00:00.000Z"),
    })
    metricRepository.createMetric.mockResolvedValueOnce({
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
        body: JSON.stringify({ shortName: "  Impact  ", description: null }),
      }),
      { params: Promise.resolve({ id: "ws-1" }) },
    )
    const payload = await response.json()

    expect(response.status).toBe(201)
    expect(metricRepository.createMetric).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      shortName: "Impact",
      description: null,
    })
    expect(payload.data).toEqual({
      workspace: {
        id: "ws-1",
        name: "Alpha",
        createdAt: "2026-04-20T12:00:00.000Z",
        updatedAt: "2026-04-20T12:00:00.000Z",
      },
      metrics: [{ id: "m-1", shortName: "Impact", description: null }],
    })
  })

  it("returns field-localizable validation details for shortName", async () => {
    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ shortName: "   " }),
      }),
      { params: Promise.resolve({ id: "ws-1" }) },
    )
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toBe("INVALID_PAYLOAD")
    expect(payload.details.fieldErrors).toHaveProperty("shortName")
  })
})
