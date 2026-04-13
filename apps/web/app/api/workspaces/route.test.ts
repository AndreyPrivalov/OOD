import { beforeEach, describe, expect, it, vi } from "vitest"

const repository = {
  list: vi.fn(),
  create: vi.fn(),
}

vi.mock("../../../lib/workspace-repository", () => ({
  getWorkspaceRepository: () => repository,
}))

import { GET, POST } from "./route"

describe("GET /api/workspaces", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns shared workspaces", async () => {
    repository.list.mockResolvedValueOnce([
      {
        id: "default-workspace",
        name: "Default workspace",
        createdAt: new Date("2026-04-13T10:00:00.000Z"),
        updatedAt: new Date("2026-04-13T10:00:00.000Z"),
      },
      {
        id: "ws-2",
        name: "Alpha",
        createdAt: new Date("2026-04-13T10:05:00.000Z"),
        updatedAt: new Date("2026-04-13T10:05:00.000Z"),
      },
    ])

    const response = await GET()
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.data).toHaveLength(2)
    expect(payload.data[1]).toMatchObject({
      id: "ws-2",
      name: "Alpha",
    })
  })
})

describe("POST /api/workspaces", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("creates a workspace from a non-empty name", async () => {
    repository.create.mockResolvedValueOnce({
      id: "ws-3",
      name: "Beta",
      createdAt: new Date("2026-04-13T10:10:00.000Z"),
      updatedAt: new Date("2026-04-13T10:10:00.000Z"),
    })

    const response = await POST(
      new Request("http://localhost/api/workspaces", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "  Beta  " }),
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(201)
    expect(repository.create).toHaveBeenCalledWith({ name: "Beta" })
    expect(payload.data).toMatchObject({
      id: "ws-3",
      name: "Beta",
    })
  })

  it("rejects an empty workspace name", async () => {
    const response = await POST(
      new Request("http://localhost/api/workspaces", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "   " }),
      }),
    )

    expect(response.status).toBe(400)
    expect(repository.create).not.toHaveBeenCalled()
  })
})
