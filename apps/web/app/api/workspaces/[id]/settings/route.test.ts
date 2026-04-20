import { beforeEach, describe, expect, it, vi } from "vitest"

const workspaceRepository = {
  getById: vi.fn(),
  rename: vi.fn(),
}

const metricRepository = {
  listMetrics: vi.fn(),
}

vi.mock("../../../../../lib/workspace-repository", () => ({
  getWorkspaceRepository: () => workspaceRepository,
}))

vi.mock("../../../../../lib/workspace-metric-repository", () => ({
  getWorkspaceMetricRepository: () => metricRepository,
}))

import { GET, PATCH } from "./route"

describe("GET /api/workspaces/:id/settings", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns canonical workspace settings shape", async () => {
    workspaceRepository.getById.mockResolvedValueOnce({
      id: "ws-1",
      name: "Alpha",
      createdAt: new Date("2026-04-20T12:00:00.000Z"),
      updatedAt: new Date("2026-04-20T12:00:00.000Z"),
    })
    metricRepository.listMetrics.mockResolvedValueOnce([
      {
        id: "m-1",
        workspaceId: "ws-1",
        shortName: "Impact",
        description: "Direct impact",
      },
    ])

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: "ws-1" }),
    })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.data).toEqual({
      workspace: {
        id: "ws-1",
        name: "Alpha",
        createdAt: "2026-04-20T12:00:00.000Z",
        updatedAt: "2026-04-20T12:00:00.000Z",
      },
      metrics: [
        {
          id: "m-1",
          shortName: "Impact",
          description: "Direct impact",
        },
      ],
    })
  })

  it("returns 404 when workspace is missing", async () => {
    workspaceRepository.getById.mockResolvedValueOnce(null)

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: "ws-missing" }),
    })
    const payload = await response.json()

    expect(response.status).toBe(404)
    expect(payload.error).toBe("WORKSPACE_NOT_FOUND")
  })
})

describe("PATCH /api/workspaces/:id/settings", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renames workspace and returns canonical workspace settings shape", async () => {
    workspaceRepository.rename.mockResolvedValueOnce({
      id: "ws-1",
      name: "Beta",
      createdAt: new Date("2026-04-20T12:00:00.000Z"),
      updatedAt: new Date("2026-04-20T12:10:00.000Z"),
    })
    metricRepository.listMetrics.mockResolvedValueOnce([])

    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "  Beta  " }),
      }),
      { params: Promise.resolve({ id: "ws-1" }) },
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(workspaceRepository.rename).toHaveBeenCalledWith("ws-1", {
      name: "Beta",
    })
    expect(payload.data.workspace).toMatchObject({
      id: "ws-1",
      name: "Beta",
    })
    expect(payload.data.metrics).toEqual([])
  })

  it("returns field-localizable validation details", async () => {
    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "   " }),
      }),
      { params: Promise.resolve({ id: "ws-1" }) },
    )
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toBe("INVALID_PAYLOAD")
    expect(payload.details.fieldErrors).toHaveProperty("name")
  })
})
